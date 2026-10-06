import { OpenAgentMail } from "../src/app.js";
import type { Config } from "../src/config.js";

const config: Config = {
  domain: "temp.local",
  smtpHost: "127.0.0.1",
  smtpPort: 0,
  smtpEnabled: false,
  httpHost: "127.0.0.1",
  httpPort: 0,
  httpEnabled: true,
  dataDir: "./data",
  persist: false,
  autoCreate: false,
  inboxTtlSeconds: 3600,
  apiToken: null,
  allowOpenHttp: false,
  maxMessagesPerInbox: 50,
  maxBodyChars: 100_000,
};

const app = new OpenAgentMail(config);
await app.start();

try {
  const base = `http://127.0.0.1:${app.httpPort}`;
  const created = (await fetch(`${base}/api/inboxes`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  }).then((response) => response.json())) as { inbox_id: string; address: string };

  const injected = await fetch(`${base}/api/inboxes/${created.inbox_id}/inject`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      subject: "Your verification code",
      text: "Your code is 482913",
    }),
  });
  if (!injected.ok) throw new Error(`inject failed: ${injected.status}`);

  const waited = await fetch(`${base}/api/inboxes/${created.inbox_id}/wait-otp`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ timeout_ms: 5_000 }),
  });
  const otp = (await waited.json()) as { code?: string; error?: string };
  if (otp.code !== "482913") {
    throw new Error(`expected 482913, got ${JSON.stringify(otp)}`);
  }

  await fetch(`${base}/api/inboxes/${created.inbox_id}`, { method: "DELETE" });
  console.log(`wait_for_otp returned ${otp.code} for ${created.address}`);
} finally {
  await app.stop();
}
