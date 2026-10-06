import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { Store } from "./store.js";

function memoryStore(overrides: { maxMessagesPerInbox?: number; defaultTtlSeconds?: number } = {}): Store {
  return new Store({
    domain: "temp.local",
    dataDir: join(tmpdir(), "open-agentmail-memory"),
    persist: false,
    defaultTtlSeconds: overrides.defaultTtlSeconds ?? 3600,
    maxMessagesPerInbox: overrides.maxMessagesPerInbox ?? 20,
    maxBodyChars: 1000,
  });
}

test("creates an inbox with a password and stores a message", async () => {
  const store = memoryStore();
  const inbox = await store.createInbox();
  assert.match(inbox.address, /@temp\.local$/);
  assert.equal(inbox.password?.length, 20);
  const message = await store.addMessage(inbox.id, {
    from: "App <app@example.com>",
    to: [inbox.address],
    subject: "Your verification code",
    text: "Your code is 482913",
  });
  assert.equal(store.listMessages(inbox.id)[0]?.id, message.id);
  assert.equal(store.getMessage(inbox.id, message.id)?.text, "Your code is 482913");
  const deleted = await store.deleteInbox(inbox.id);
  assert.equal(deleted?.address, inbox.address);
  assert.equal(store.getInbox(inbox.id), null);
  assert.equal(store.listMessages(inbox.id).length, 0);
});

test("drops the oldest messages past the cap", async () => {
  const store = memoryStore({ maxMessagesPerInbox: 2 });
  const inbox = await store.createInbox();
  await store.addMessage(inbox.id, { from: "a", to: [], subject: "one", text: "1" });
  await store.addMessage(inbox.id, { from: "a", to: [], subject: "two", text: "2" });
  await store.addMessage(inbox.id, { from: "a", to: [], subject: "three", text: "3" });
  const subjects = store.listMessages(inbox.id).map((message) => message.subject);
  assert.deepEqual(subjects, ["three", "two"]);
});

test("expires inboxes when the clock passes expiresAt", async () => {
  const store = memoryStore({ defaultTtlSeconds: 10 });
  let now = Date.parse("2026-10-05T12:00:00.000Z");
  store.now = () => new Date(now);
  const inbox = await store.createInbox();
  now += 10_000;
  assert.equal(store.getInbox(inbox.id), null);
});

test("reloads a file-backed store", async () => {
  const dir = await mkdtemp(join(tmpdir(), "open-agentmail-store-"));
  const options = {
    domain: "temp.local",
    dataDir: dir,
    persist: true,
    defaultTtlSeconds: 0,
    maxMessagesPerInbox: 20,
    maxBodyChars: 1000,
  };
  const first = new Store(options);
  await first.load();
  const inbox = await first.createInbox({ localPart: "ada" });
  await first.addMessage(inbox.id, { from: "a", to: [], subject: "hi", text: "Your code is 482913" });
  const raw = await readFile(join(dir, "store.json"), "utf8");
  assert.match(raw, /ada@temp\.local/);

  const second = new Store(options);
  await second.load();
  assert.equal(second.getInboxByAddress("ada@temp.local")?.id, inbox.id);
  assert.equal(second.listMessages(inbox.id)[0]?.subject, "hi");
});
