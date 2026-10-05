import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { Agentbox } from "./app.js";
import type { Config } from "./config.js";
import { SmtpDialogError, sendSmtpMessage } from "./smtp-send.js";

async function start(overrides: Partial<Config> = {}): Promise<Agentbox> {
  const dir = await mkdtemp(join(tmpdir(), "agentbox-smtp-"));
  const app = new Agentbox({
    domain: "temp.local",
    smtpHost: "127.0.0.1",
    smtpPort: 0,
    smtpEnabled: true,
    httpHost: "127.0.0.1",
    httpPort: 0,
    httpEnabled: true,
    dataDir: dir,
    persist: false,
    autoCreate: false,
    inboxTtlSeconds: 3600,
    apiToken: null,
    allowOpenHttp: false,
    maxMessagesPerInbox: 20,
    maxBodyChars: 20_000,
    ...overrides,
  });
  await app.start();
  return app;
}

test("stores SMTP mail and rejects unknown recipients", async () => {
  const app = await start();
  try {
    const inbox = await app.actions.createInbox({ localPart: "smtp-user" });
    await sendSmtpMessage({
      port: app.smtpPort,
      from: "app@example.com",
      to: inbox.address,
      subject: "Login code",
      text: "Your code is 998877",
    });
    const listed = app.actions.listMessages({ inbox_id: inbox.id });
    assert.equal(listed.messages.length, 1);
    assert.equal(listed.messages[0]?.subject, "Login code");
    assert.match(listed.messages[0]?.snippet ?? "", /998877/);
    const otp = await app.actions.waitForOtp({ inbox_id: inbox.id, timeout_ms: 0 });
    assert.equal(otp.code, "998877");

    const rejected = await sendSmtpMessage({
      port: app.smtpPort,
      from: "app@example.com",
      to: "missing@temp.local",
      subject: "nope",
      text: "Your code is 000000",
    }).then(
      () => null,
      (error: unknown) => error,
    );
    assert.ok(rejected instanceof SmtpDialogError);
    assert.equal(rejected.code, 550);
  } finally {
    await app.stop();
  }
});

test("can auto-create an inbox on first delivery", async () => {
  const app = await start({ autoCreate: true });
  try {
    await sendSmtpMessage({
      port: app.smtpPort,
      from: "app@example.com",
      to: "fresh@temp.local",
      subject: "Welcome",
      text: "Your code is 424242",
    });
    const inbox = app.store.getInboxByAddress("fresh@temp.local");
    assert.ok(inbox);
    assert.equal(app.store.listMessages(inbox.id)[0]?.subject, "Welcome");
  } finally {
    await app.stop();
  }
});
