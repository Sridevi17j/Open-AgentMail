import { OpenAgentMail } from "../src/app.js";
import type { Config } from "../src/config.js";
import { sendSmtpMessage } from "../src/smtp-send.js";

const config: Config = {
  domain: "temp.local",
  smtpHost: "127.0.0.1",
  smtpPort: 0,
  smtpEnabled: true,
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
    body: JSON.stringify({ local_part: "smtp-demo" }),
  }).then((response) => response.json())) as { inbox_id: string; address: string };

  await sendSmtpMessage({
    port: app.smtpPort,
    from: "app@example.com",
    to: created.address,
    subject: "Login code",
    text: "Your code is 998877",
  });

  const listed = (await fetch(`${base}/api/inboxes/${created.inbox_id}/messages`).then((response) =>
    response.json(),
  )) as { messages: { subject: string; snippet: string }[] };
  const message = listed.messages[0];
  if (!message || !message.snippet.includes("998877")) {
    throw new Error(`SMTP message was not stored: ${JSON.stringify(listed)}`);
  }

  await fetch(`${base}/api/inboxes/${created.inbox_id}`, { method: "DELETE" });
  console.log(`SMTP delivered "Login code" to ${created.address} on 127.0.0.1:${app.smtpPort}`);
} finally {
  await app.stop();
}
