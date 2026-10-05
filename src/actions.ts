import { AgentboxError } from "./errors.js";
import { extractLink, extractOtp, messageBody, snippetAround } from "./extract.js";
import type { DeleteInboxArgs, InjectMessageArgs, ListMessagesArgs, WaitArgs } from "./schemas.js";
import type { Store } from "./store.js";
import type { Inbox, LinkJson, MessageJson, MessageSummaryJson, OtpJson, StoredMessage } from "./types.js";
import { inboxJson, messageJson, summaryJson } from "./types.js";

export interface WaitOptions {
  signal?: AbortSignal;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new AgentboxError("Wait cancelled", 499));
    };
    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export class Actions {
  constructor(private readonly store: Store) {}

  async createInbox(input: { localPart?: string; ttlSeconds?: number; withPassword?: boolean } = {}): Promise<Inbox> {
    let localPart = input.localPart?.trim().toLowerCase();
    if (localPart?.includes("@")) {
      const [name, domain] = localPart.split("@");
      if (!name || !domain || domain !== this.store.domain) {
        throw new AgentboxError(`Address must use the configured domain ${this.store.domain}`);
      }
      localPart = name;
    }
    return this.store.createInbox({ ...input, localPart });
  }

  resolveInbox(ref: { inbox_id?: string; address?: string }): Inbox {
    if (ref.inbox_id) {
      const inbox = this.store.getInbox(ref.inbox_id);
      if (!inbox) throw new AgentboxError("Inbox not found", 404);
      if (ref.address && inbox.address !== ref.address.trim().toLowerCase()) {
        throw new AgentboxError("inbox_id and address refer to different inboxes");
      }
      return inbox;
    }
    if (ref.address) {
      const inbox = this.store.getInboxByAddress(ref.address);
      if (!inbox) throw new AgentboxError("Inbox not found", 404);
      return inbox;
    }
    throw new AgentboxError("Provide inbox_id or address");
  }

  listMessages(args: ListMessagesArgs): { inbox_id: string; address: string; messages: MessageSummaryJson[] } {
    const inbox = this.resolveInbox(args);
    const limit = args.limit ?? 20;
    return {
      inbox_id: inbox.id,
      address: inbox.address,
      messages: this.store.listMessages(inbox.id).slice(0, limit).map(summaryJson),
    };
  }

  getMessage(inboxRef: { inbox_id?: string; address?: string }, messageId: string): MessageJson {
    const inbox = this.resolveInbox(inboxRef);
    const message = this.store.getMessage(inbox.id, messageId);
    if (!message) throw new AgentboxError("Message not found", 404);
    return messageJson(message);
  }

  async deleteInbox(args: DeleteInboxArgs): Promise<{ deleted: true; inbox_id: string; address: string }> {
    const inbox = this.resolveInbox(args);
    const deleted = await this.store.deleteInbox(inbox.id);
    if (!deleted) throw new AgentboxError("Inbox not found", 404);
    return { deleted: true, inbox_id: deleted.id, address: deleted.address };
  }

  async injectMessage(args: InjectMessageArgs): Promise<{ message_id: string; inbox_id: string; received_at: string }> {
    if (!args.text?.trim() && !args.html?.trim()) {
      throw new AgentboxError("inject_message requires text or html");
    }
    const inbox = this.resolveInbox(args);
    const message = await this.store.addMessage(inbox.id, {
      from: args.from?.trim() || `Agentbox <noreply@${this.store.domain}>`,
      to: [inbox.address],
      subject: args.subject,
      text: args.text ?? "",
      html: args.html ?? null,
    });
    return { message_id: message.id, inbox_id: inbox.id, received_at: message.receivedAt };
  }

  async waitForOtp(args: WaitArgs, options: WaitOptions = {}): Promise<OtpJson> {
    const found = await this.poll(args, options, (message) => {
      const body = messageBody(message.text, message.html);
      const code = extractOtp(body, args.regex);
      if (!code) return null;
      return { code, message_id: message.id, raw_snippet: snippetAround(body, code) };
    });
    if (!found) throw new AgentboxError("Timed out waiting for an OTP", 408);
    return found;
  }

  async waitForLink(args: WaitArgs, options: WaitOptions = {}): Promise<LinkJson> {
    const found = await this.poll(args, options, (message) => {
      const url = extractLink(message.text, message.html, args.regex);
      if (!url) return null;
      const body = messageBody(message.text, message.html);
      return { url, message_id: message.id, raw_snippet: snippetAround(`${body}\n${url}`, url) };
    });
    if (!found) throw new AgentboxError("Timed out waiting for a magic link", 408);
    return found;
  }

  listInboxes() {
    return this.store.listInboxes().map(inboxJson);
  }

  private async poll<T>(
    args: WaitArgs,
    options: WaitOptions,
    read: (message: StoredMessage) => T | null,
  ): Promise<T | null> {
    const inbox = this.resolveInbox(args);
    const timeoutMs = args.timeout_ms ?? 30_000;
    const intervalMs = args.interval_ms ?? 500;
    const notBefore = parseNotBefore(args.not_before);
    const deadline = Date.now() + timeoutMs;

    for (;;) {
      if (options.signal?.aborted) throw new AgentboxError("Wait cancelled", 499);
      const match = this.findInInbox(inbox.id, args, notBefore, read);
      if (match) return match;
      const remaining = deadline - Date.now();
      if (remaining <= 0) return null;
      await sleep(Math.min(intervalMs, remaining), options.signal);
    }
  }

  private findInInbox<T>(
    inboxId: string,
    args: WaitArgs,
    notBefore: number | null,
    read: (message: StoredMessage) => T | null,
  ): T | null {
    const subject = args.subject?.toLowerCase();
    const from = args.from?.toLowerCase();
    for (const message of this.store.listMessages(inboxId)) {
      if (notBefore !== null && Date.parse(message.receivedAt) < notBefore) continue;
      if (subject && !message.subject.toLowerCase().includes(subject)) continue;
      if (from && !message.from.toLowerCase().includes(from)) continue;
      let match: T | null;
      try {
        match = read(message);
      } catch (error) {
        throw error instanceof AgentboxError
          ? error
          : new AgentboxError(error instanceof Error ? error.message : "Could not read the message");
      }
      if (match) return match;
    }
    return null;
  }
}

function parseNotBefore(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) throw new AgentboxError("not_before must be an ISO timestamp");
  return parsed;
}

export function createInboxResult(inbox: Inbox) {
  return {
    address: inbox.address,
    password: inbox.password,
    inbox_id: inbox.id,
    expires_at: inbox.expiresAt,
  };
}
