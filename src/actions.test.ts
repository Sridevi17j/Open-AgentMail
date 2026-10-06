import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { Actions } from "./actions.js";
import { Store } from "./store.js";

function actions(): Actions {
  return new Actions(
    new Store({
      domain: "temp.local",
      dataDir: join(tmpdir(), "open-agentmail-actions"),
      persist: false,
      defaultTtlSeconds: 3600,
      maxMessagesPerInbox: 20,
      maxBodyChars: 20_000,
    }),
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("wait_for_otp returns the injected code and ignores older mail", async () => {
  const api = actions();
  const inbox = await api.createInbox();
  await api.injectMessage({
    inbox_id: inbox.id,
    subject: "Older",
    text: "Your code is 111111",
  });
  await sleep(20);
  const notBefore = new Date().toISOString();
  await sleep(20);
  await api.injectMessage({
    inbox_id: inbox.id,
    subject: "Your verification code",
    text: "Your code is 482913",
  });
  const otp = await api.waitForOtp({ inbox_id: inbox.id, timeout_ms: 200, not_before: notBefore });
  assert.equal(otp.code, "482913");
  assert.match(otp.raw_snippet, /482913/);

  const filtered = await api.waitForOtp({
    inbox_id: inbox.id,
    timeout_ms: 0,
    subject: "does-not-match",
  }).catch((error: unknown) => error);
  assert.ok(filtered instanceof Error);
  assert.match(filtered.message, /Timed out/);
});

test("wait_for_link prefers the verify url", async () => {
  const api = actions();
  const inbox = await api.createInbox({ withPassword: false });
  assert.equal(inbox.password, null);
  await api.injectMessage({
    inbox_id: inbox.id,
    subject: "Sign in",
    text: "Confirm your email",
    html: '<a href="https://app.test/unsubscribe">No</a><a href="https://app.test/verify?token=abc">Yes</a>',
  });
  const link = await api.waitForLink({ address: inbox.address, timeout_ms: 0 });
  assert.equal(link.url, "https://app.test/verify?token=abc");
});

test("lists newest messages first and deletes them", async () => {
  const api = actions();
  const inbox = await api.createInbox({ localPart: "ada@temp.local" });
  assert.equal(inbox.address, "ada@temp.local");
  await api.injectMessage({ inbox_id: inbox.id, subject: "first", text: "one" });
  await api.injectMessage({ inbox_id: inbox.id, subject: "second", text: "two" });
  const listed = api.listMessages({ inbox_id: inbox.id });
  assert.deepEqual(
    listed.messages.map((message) => message.subject),
    ["second", "first"],
  );
  const full = api.getMessage({ inbox_id: inbox.id }, listed.messages[0]!.id);
  assert.equal(full.text, "two");
  await api.deleteInbox({ address: inbox.address });
  await assert.rejects(() => api.waitForOtp({ inbox_id: inbox.id, timeout_ms: 0 }), /Inbox not found/);
});
