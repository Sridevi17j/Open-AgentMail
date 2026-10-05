import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { AgentboxError } from "./errors.js";
import { log } from "./log.js";
import { isValidLocalPart, randomLocalPart, randomPassword } from "./passwords.js";
import type { Inbox, StoredMessage } from "./types.js";
import { makeSnippet } from "./extract.js";

interface Snapshot {
  version: 1;
  inboxes: Inbox[];
  messages: StoredMessage[];
}

export interface StoreOptions {
  domain: string;
  dataDir: string;
  persist: boolean;
  defaultTtlSeconds: number;
  maxMessagesPerInbox: number;
  maxBodyChars: number;
}

export interface CreateInboxInput {
  localPart?: string;
  ttlSeconds?: number;
  withPassword?: boolean;
}

export interface NewMessageInput {
  from: string;
  to: string[];
  subject: string;
  text?: string;
  html?: string | null;
  receivedAt?: string;
}

function clip(value: string, max: number): string {
  const cleaned = value.replace(/\u0000/g, "");
  return cleaned.length > max ? cleaned.slice(0, max) : cleaned;
}

export class Store {
  readonly domain: string;
  now: () => Date = () => new Date();

  private readonly persist: boolean;
  private readonly filePath: string;
  private readonly defaultTtlSeconds: number;
  private readonly maxMessagesPerInbox: number;
  private readonly maxBodyChars: number;
  private inboxes: Inbox[] = [];
  private messages: StoredMessage[] = [];
  private seq = 0;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(options: StoreOptions) {
    this.domain = options.domain.toLowerCase();
    this.persist = options.persist;
    this.filePath = join(options.dataDir, "store.json");
    this.defaultTtlSeconds = options.defaultTtlSeconds;
    this.maxMessagesPerInbox = options.maxMessagesPerInbox;
    this.maxBodyChars = options.maxBodyChars;
  }

  async load(): Promise<void> {
    if (!this.persist) return;
    let raw: string;
    try {
      raw = await readFile(this.filePath, "utf8");
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") return;
      throw error;
    }
    let parsed: Snapshot;
    try {
      parsed = JSON.parse(raw) as Snapshot;
    } catch {
      throw new Error(`Mailbox store at ${this.filePath} is not valid JSON. Move it aside and start again.`);
    }
    if (parsed.version !== 1 || !Array.isArray(parsed.inboxes) || !Array.isArray(parsed.messages)) {
      throw new Error(`Mailbox store at ${this.filePath} has an unsupported shape.`);
    }
    this.inboxes = parsed.inboxes;
    this.messages = parsed.messages.map((message) => ({ ...message, seq: message.seq ?? 0 }));
    this.seq = this.messages.reduce((max, message) => Math.max(max, message.seq), 0);
    if (this.purgeExpired()) await this.persistNow();
  }

  async createInbox(input: CreateInboxInput = {}): Promise<Inbox> {
    this.purgeExpired();
    const requested = input.localPart?.trim().toLowerCase();
    let localPart: string;
    if (requested) {
      if (!isValidLocalPart(requested)) {
        throw new AgentboxError("local_part must be 1-64 characters of letters, numbers, and . _ + -");
      }
      localPart = requested;
    } else {
      let generated: string | undefined;
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const candidate = randomLocalPart();
        if (!this.inboxes.some((inbox) => inbox.localPart === candidate)) {
          generated = candidate;
          break;
        }
      }
      if (!generated) throw new AgentboxError("Could not allocate a mailbox name", 500);
      localPart = generated;
    }
    const address = `${localPart}@${this.domain}`;
    if (this.inboxes.some((inbox) => inbox.address === address)) {
      throw new AgentboxError(`Inbox ${address} already exists`, 409);
    }
    const ttlSeconds = input.ttlSeconds ?? this.defaultTtlSeconds;
    if (!Number.isInteger(ttlSeconds) || ttlSeconds < 0) {
      throw new AgentboxError("ttl_seconds must be an integer >= 0");
    }
    const createdAt = this.now().toISOString();
    const inbox: Inbox = {
      id: randomUUID(),
      address,
      localPart,
      password: input.withPassword === false ? null : randomPassword(),
      createdAt,
      expiresAt: ttlSeconds === 0 ? null : new Date(this.now().getTime() + ttlSeconds * 1000).toISOString(),
    };
    this.inboxes.push(inbox);
    await this.persistNow();
    return inbox;
  }

  getInbox(id: string): Inbox | null {
    this.purgeExpired();
    return this.inboxes.find((inbox) => inbox.id === id) ?? null;
  }

  getInboxByAddress(address: string): Inbox | null {
    this.purgeExpired();
    const normalized = address.trim().toLowerCase();
    return this.inboxes.find((inbox) => inbox.address === normalized) ?? null;
  }

  listInboxes(): Inbox[] {
    this.purgeExpired();
    return [...this.inboxes].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async deleteInbox(id: string): Promise<Inbox | null> {
    this.purgeExpired();
    const inbox = this.inboxes.find((item) => item.id === id);
    if (!inbox) return null;
    this.inboxes = this.inboxes.filter((item) => item.id !== id);
    this.messages = this.messages.filter((message) => message.inboxId !== id);
    await this.persistNow();
    return inbox;
  }

  async addMessage(inboxId: string, input: NewMessageInput): Promise<StoredMessage> {
    this.purgeExpired();
    const inbox = this.inboxes.find((item) => item.id === inboxId);
    if (!inbox) throw new AgentboxError("Inbox not found", 404);
    const text = clip(input.text ?? "", this.maxBodyChars);
    const html = input.html == null ? null : clip(input.html, this.maxBodyChars);
    const message: StoredMessage = {
      id: randomUUID(),
      inboxId,
      seq: ++this.seq,
      from: clip(input.from, 500),
      to: input.to.map((value) => clip(value, 320)).slice(0, 20),
      subject: clip(input.subject.trim() || "(no subject)", 500),
      text,
      html,
      snippet: makeSnippet(text, html),
      receivedAt: input.receivedAt ?? this.now().toISOString(),
    };
    this.messages.push(message);
    const mine = this.messages.filter((item) => item.inboxId === inboxId);
    if (mine.length > this.maxMessagesPerInbox) {
      const drop = new Set(mine.slice(0, mine.length - this.maxMessagesPerInbox).map((item) => item.id));
      this.messages = this.messages.filter((item) => !drop.has(item.id));
    }
    await this.persistNow();
    return message;
  }

  listMessages(inboxId: string): StoredMessage[] {
    this.purgeExpired();
    if (!this.inboxes.some((inbox) => inbox.id === inboxId)) return [];
    return this.messages
      .filter((message) => message.inboxId === inboxId)
      .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt) || b.seq - a.seq);
  }

  getMessage(inboxId: string, messageId: string): StoredMessage | null {
    this.purgeExpired();
    return this.messages.find((message) => message.inboxId === inboxId && message.id === messageId) ?? null;
  }

  async sweep(): Promise<number> {
    const before = this.inboxes.length;
    if (!this.purgeExpired()) return 0;
    await this.persistNow();
    return before - this.inboxes.length;
  }

  private purgeExpired(): boolean {
    const now = this.now().getTime();
    const expired = new Set(
      this.inboxes
        .filter((inbox) => inbox.expiresAt !== null && Date.parse(inbox.expiresAt) <= now)
        .map((inbox) => inbox.id),
    );
    if (expired.size === 0) return false;
    this.inboxes = this.inboxes.filter((inbox) => !expired.has(inbox.id));
    this.messages = this.messages.filter((message) => !expired.has(message.inboxId));
    return true;
  }

  private snapshot(): Snapshot {
    return { version: 1, inboxes: this.inboxes, messages: this.messages };
  }

  private async persistNow(): Promise<void> {
    if (!this.persist) return;
    const run = this.writeChain.then(async () => {
      const json = JSON.stringify(this.snapshot(), null, 2);
      await mkdir(dirname(this.filePath), { recursive: true });
      const tmp = `${this.filePath}.tmp`;
      await writeFile(tmp, json);
      await rename(tmp, this.filePath);
    });
    this.writeChain = run.catch((error: unknown) => {
      log.error("failed to persist mailbox store", error instanceof Error ? error.message : error);
    });
    await run;
  }
}
