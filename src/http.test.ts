import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { Agentbox } from "./app.js";
import type { Config } from "./config.js";

async function start(overrides: Partial<Config> = {}): Promise<Agentbox> {
  const dir = await mkdtemp(join(tmpdir(), "agentbox-http-"));
  const config: Config = {
    domain: "temp.local",
    smtpHost: "127.0.0.1",
    smtpPort: 0,
    smtpEnabled: false,
    httpHost: "127.0.0.1",
    httpPort: 0,
    httpEnabled: true,
    dataDir: dir,
    persist: false,
    autoCreate: false,
    inboxTtlSeconds: 3600,
    apiToken: null,
    allowOpenHttp: false,
    maxMessagesPerInbox: 50,
    maxBodyChars: 20_000,
    ...overrides,
  };
  const app = new Agentbox(config);
  await app.start();
  return app;
}

test("http sample flow returns 482913", async () => {
  const app = await start();
  try {
    const base = `http://127.0.0.1:${app.httpPort}`;
    const health = (await fetch(`${base}/health`).then((response) => response.json())) as { ok: boolean; domain: string };
    assert.equal(health.ok, true);
    assert.equal(health.domain, "temp.local");
    const page = await fetch(base).then((response) => response.text());
    assert.match(page, /Agentbox mailroom/);
    assert.match(page, /Run sample OTP/);

    const created = (await fetch(`${base}/api/inboxes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }).then((response) => response.json())) as { inbox_id: string; address: string; password: string };
    assert.match(created.address, /@temp\.local$/);
    assert.ok(created.password);

    const injected = await fetch(`${base}/api/inboxes/${created.inbox_id}/inject`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ subject: "Your verification code", text: "Your code is 482913" }),
    });
    assert.equal(injected.status, 201);

    const otp = (await fetch(`${base}/api/inboxes/${created.inbox_id}/wait-otp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ timeout_ms: 500 }),
    }).then((response) => response.json())) as { code: string };
    assert.equal(otp.code, "482913");

    const missed = await fetch(`${base}/api/inboxes/${created.inbox_id}/wait-otp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ timeout_ms: 0, subject: "missing" }),
    });
    assert.equal(missed.status, 408);

    const removed = await fetch(`${base}/api/inboxes/${created.inbox_id}`, { method: "DELETE" });
    assert.equal(removed.status, 200);
    const gone = await fetch(`${base}/api/inboxes/${created.inbox_id}`);
    assert.equal(gone.status, 404);
  } finally {
    await app.stop();
  }
});

test("requires a bearer token when one is configured", async () => {
  const app = await start({ apiToken: "secret-token" });
  try {
    const base = `http://127.0.0.1:${app.httpPort}`;
    const denied = await fetch(`${base}/api/inboxes`);
    assert.equal(denied.status, 401);
    const allowed = await fetch(`${base}/api/inboxes`, {
      headers: { authorization: "Bearer secret-token" },
    });
    assert.equal(allowed.status, 200);
  } finally {
    await app.stop();
  }
});

test("refuses to publish HTTP without a token", async () => {
  const dir = await mkdtemp(join(tmpdir(), "agentbox-open-"));
  const app = new Agentbox({
    domain: "temp.local",
    smtpHost: "127.0.0.1",
    smtpPort: 0,
    smtpEnabled: false,
    httpHost: "0.0.0.0",
    httpPort: 0,
    httpEnabled: true,
    dataDir: dir,
    persist: false,
    autoCreate: false,
    inboxTtlSeconds: 0,
    apiToken: null,
    allowOpenHttp: false,
    maxMessagesPerInbox: 10,
    maxBodyChars: 1000,
  });
  await assert.rejects(() => app.start(), /AGENTBOX_API_TOKEN/);
});
