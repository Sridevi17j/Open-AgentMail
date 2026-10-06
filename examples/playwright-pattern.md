# Playwright pattern

This is a sketch for a script that already has Open-AgentMail running (`npm run dev` or `npm start`). It is not a dependency of this package and it is not run in CI. The same sequence is what an agent should follow with the MCP tools `create_inbox`, `wait_for_otp`, and `delete_inbox`.

Use it only against an application you are allowed to test. Do not point it at Google, GitHub, or any other OAuth provider. `temp.local` works when the app delivers mail to the local SMTP port, or when you inject the message yourself. A real staging site needs your own domain and an MX record.

```ts
import { chromium } from "playwright";

const mailroom = "http://127.0.0.1:8791";

const inbox = await fetch(`${mailroom}/api/inboxes`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: "{}",
}).then((response) => response.json());

const notBefore = new Date().toISOString();
const browser = await chromium.launch();
const page = await browser.newPage();

try {
  await page.goto("http://127.0.0.1:3000/");
  await page.getByLabel("Email").fill(inbox.address);
  await page.getByLabel("Password").fill(inbox.password);
  await page.getByRole("button", { name: "Create account" }).click();

  const otp = await fetch(`${mailroom}/api/inboxes/${inbox.inbox_id}/wait-otp`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ timeout_ms: 30_000, not_before: notBefore }),
  }).then((response) => response.json());

  if (!otp.code) throw new Error(otp.error ?? "No OTP arrived");
  await page.getByLabel("Code").fill(otp.code);
  await page.getByRole("button", { name: "Verify" }).click();
} finally {
  await fetch(`${mailroom}/api/inboxes/${inbox.inbox_id}`, { method: "DELETE" });
  await browser.close();
}
```

For a magic link, call `wait-link` instead of `wait-otp`, check that the URL host is the app under test, then `page.goto` that URL.
