import { createServer } from "node:net";
import { simpleParser, type ParsedMail } from "mailparser";
import smtpServerModule from "smtp-server";
import type { SMTPServerDataStream, SMTPServerSession } from "smtp-server";

import type { Config } from "./config.js";
import { OpenAgentMailError } from "./errors.js";
import { log } from "./log.js";
import { isValidLocalPart } from "./passwords.js";
import type { Store } from "./store.js";

const { SMTPServer } = smtpServerModule;

const recipients = new WeakMap<SMTPServerSession, string[]>();

function smtpError(code: number, message: string): Error {
  const error = new Error(`${code} ${message}`) as Error & { responseCode?: number };
  error.responseCode = code;
  return error;
}

function addressText(parsed: ParsedMail["from"]): string {
  if (!parsed) return "";
  return parsed.text ?? "";
}

function destinationText(parsed: ParsedMail["to"]): string[] {
  if (!parsed) return [];
  const list = Array.isArray(parsed) ? parsed : [parsed];
  return list.flatMap((item) => item.value.map((entry) => entry.address ?? "").filter((value) => value.length > 0));
}

function htmlBody(parsed: ParsedMail): string | null {
  if (typeof parsed.html === "string" && parsed.html.length > 0) return parsed.html;
  return null;
}

export class SmtpReceiver {
  private server: InstanceType<typeof SMTPServer> | null = null;

  constructor(
    private readonly store: Store,
    private readonly config: Config,
  ) {}

  listen(): Promise<number> {
    const server = new SMTPServer({
      secure: false,
      authOptional: true,
      disabledCommands: ["AUTH", "STARTTLS"],
      disableReverseLookup: true,
      hideSTARTTLS: true,
      banner: "Open-AgentMail ESMTP ready",
      size: 1_000_000,
      socketTimeout: 30_000,
      onRcptTo: (address, session, callback) => {
        void this.acceptRecipient(address.address)
          .then((inboxId) => {
            const current = recipients.get(session) ?? [];
            current.push(inboxId);
            recipients.set(session, current);
            callback();
          })
          .catch((error: unknown) => {
            callback(error instanceof Error ? error : smtpError(451, "Mailbox unavailable"));
          });
      },
      onData: (stream, session, callback) => {
        void this.receive(stream, session)
          .then(() => callback())
          .catch((error: unknown) => {
            callback(error instanceof Error ? error : smtpError(451, "Unable to store message"));
          });
      },
    });

    this.server = server;
    return new Promise((resolve, reject) => {
      server.on("error", (error) => {
        log.error("smtp error", error.message);
        reject(error);
      });
      server.listen(this.config.smtpPort, this.config.smtpHost, () => {
        const address = server.server.address();
        const port = address && typeof address === "object" ? address.port : this.config.smtpPort;
        resolve(port);
      });
    });
  }

  async close(): Promise<void> {
    const server = this.server;
    if (!server) return;
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    this.server = null;
  }

  private async acceptRecipient(rawAddress: string): Promise<string> {
    const address = rawAddress.trim().replace(/^<|>$/g, "").toLowerCase();
    const at = address.lastIndexOf("@");
    if (at <= 0) throw smtpError(550, "Invalid recipient");
    const localPart = address.slice(0, at);
    const domain = address.slice(at + 1);
    if (domain !== this.store.domain) throw smtpError(550, `Relaying denied for ${domain}`);
    if (!isValidLocalPart(localPart)) throw smtpError(550, "Invalid recipient");

    const existing = this.store.getInboxByAddress(address);
    if (existing) return existing.id;
    if (!this.config.autoCreate) {
      throw smtpError(550, `No such inbox ${address}. Create it with Open-AgentMail first.`);
    }
    try {
      const created = await this.store.createInbox({ localPart });
      log.info(`auto-created inbox ${created.address}`);
      return created.id;
    } catch (error) {
      if (error instanceof OpenAgentMailError && error.status === 409) {
        const raced = this.store.getInboxByAddress(address);
        if (raced) return raced.id;
      }
      throw error instanceof OpenAgentMailError ? smtpError(550, error.message) : error;
    }
  }

  private async receive(stream: SMTPServerDataStream, session: SMTPServerSession): Promise<void> {
    const inboxIds = recipients.get(session) ?? [];
    const parsed = await simpleParser(stream);
    if (inboxIds.length === 0) throw smtpError(550, "No accepted recipients");
    const text = typeof parsed.text === "string" ? parsed.text : "";
    const html = htmlBody(parsed);
    const subject = parsed.subject?.trim() || "(no subject)";
    const from = addressText(parsed.from) || "unknown";
    const to = destinationText(parsed.to);
    for (const inboxId of inboxIds) {
      const inbox = this.store.getInbox(inboxId);
      if (!inbox) continue;
      await this.store.addMessage(inboxId, {
        from,
        to: to.length > 0 ? to : [inbox.address],
        subject,
        text,
        html,
      });
      log.info(`smtp stored message for ${inbox.address}`, { from, subject });
    }
  }
}

export function reservePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = address && typeof address === "object" ? address.port : 0;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
    server.on("error", reject);
  });
}
