import { randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import net from "node:net";

const PORT = Number(process.env.PORT || 3000);
const SMTP_HOST = process.env.SMTP_HOST || "127.0.0.1";
const SMTP_PORT = Number(process.env.SMTP_PORT || 2525);
const FROM_ADDRESS = "noreply@fieldnote.test";
const OTP_TTL_MS = 10 * 60 * 1000;

const users = new Map();
const sessions = new Map();

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function parseCookies(header) {
  const cookies = {};
  if (!header) return cookies;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!name) continue;
    try {
      cookies[name] = decodeURIComponent(value);
    } catch {
      cookies[name] = value;
    }
  }
  return cookies;
}

function cookie(name, value, maxAgeSeconds) {
  const parts = [`${name}=${encodeURIComponent(value)}`, "Path=/", "HttpOnly", "SameSite=Lax"];
  if (maxAgeSeconds !== undefined) parts.push(`Max-Age=${maxAgeSeconds}`);
  return parts.join("; ");
}

function safeEqual(left, right) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function page({ title, message, messageOk = false, body }) {
  const note = message
    ? `<p id="message" role="status" class="${messageOk ? "ok" : "err"}">${escapeHtml(message)}</p>`
    : `<p id="message" role="status"></p>`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} · Fieldnote</title>
  <style>
    :root { color-scheme: light; --ink: #172033; --muted: #5c6b80; --paper: #eef3f8; --line: #d5dfeb; --accent: #1d4e89; --ok: #0e6b56; --err: #8d2e24; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: var(--paper); color: var(--ink); font: 16px/1.5 "Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif; }
    main { width: min(440px, calc(100% - 32px)); margin: 40px auto; background: white; border: 1px solid var(--line); border-radius: 18px; padding: 28px 24px 24px; }
    .mark { margin: 0; letter-spacing: 0.14em; text-transform: uppercase; font-size: 0.78rem; color: var(--accent); font-weight: 700; }
    h1 { margin: 8px 0 8px; font-size: 1.7rem; line-height: 1.15; letter-spacing: -0.03em; }
    p { margin: 0 0 12px; }
    .muted { color: var(--muted); }
    label { display: block; margin: 14px 0 6px; font-weight: 650; }
    input { width: 100%; min-height: 44px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; font: inherit; background: white; }
    button { margin-top: 18px; width: 100%; min-height: 44px; border: 0; border-radius: 999px; background: var(--accent); color: white; font: inherit; font-weight: 650; cursor: pointer; }
    button:hover { background: #163e6e; }
    a { color: var(--accent); }
    #message:empty { display: none; }
    #message { margin: 0 0 8px; padding: 10px 12px; border-radius: 10px; }
    #message.err { background: #fde8e2; color: var(--err); }
    #message.ok { background: #e5f5ee; color: var(--ok); }
    #welcome-email { font-weight: 700; }
    :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  </style>
</head>
<body>
  <main>
    <p class="mark">Fieldnote</p>
    ${note}
    ${body}
  </main>
</body>
</html>`;
}

function signupPage(message, messageOk = false) {
  return page({
    title: "Create account",
    message,
    messageOk,
    body: `
      <h1>Create account</h1>
      <p class="muted">We'll email a 6-digit code before you can log in.</p>
      <form method="post" action="/signup">
        <label for="email">Email</label>
        <input id="email" name="email" type="email" autocomplete="username" required>
        <label for="password">Password</label>
        <input id="password" name="password" type="password" autocomplete="new-password" minlength="8" required>
        <button type="submit">Create account</button>
      </form>
      <p class="muted">Already verified? <a href="/login">Log in</a></p>`,
  });
}

function verifyPage(email, message, messageOk = false) {
  const who = email ? `<p class="muted">Code sent to <strong>${escapeHtml(email)}</strong>.</p>` : `<p class="muted">Enter the 6-digit code from your email.</p>`;
  return page({
    title: "Verify email",
    message,
    messageOk,
    body: `
      <h1>Check your email</h1>
      ${who}
      <form method="post" action="/verify">
        <label for="otp">Verification code</label>
        <input id="otp" name="otp" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" minlength="6" maxlength="6" required>
        <button type="submit">Verify</button>
      </form>
      <p class="muted"><a href="/">Use a different email</a></p>`,
  });
}

function loginPage(message, messageOk = false) {
  return page({
    title: "Log in",
    message,
    messageOk,
    body: `
      <h1>Log in</h1>
      <p class="muted">Verified accounts only.</p>
      <form method="post" action="/login">
        <label for="email">Email</label>
        <input id="email" name="email" type="email" autocomplete="username" required>
        <label for="password">Password</label>
        <input id="password" name="password" type="password" autocomplete="current-password" required>
        <button type="submit">Log in</button>
      </form>
      <p class="muted">Need an account? <a href="/">Create account</a></p>`,
  });
}

function dashboardPage(email) {
  return page({
    title: "Dashboard",
    message: "",
    body: `
      <h1>Welcome, <span id="welcome-email">${escapeHtml(email)}</span></h1>
      <p class="muted">You're signed in. This page is only available after the email code is verified.</p>
      <form method="post" action="/logout">
        <button type="submit">Log out</button>
      </form>`,
  });
}

function send(res, status, html, cookies = []) {
  const headers = { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" };
  if (cookies.length > 0) headers["set-cookie"] = cookies;
  res.writeHead(status, headers);
  res.end(html);
}

function redirect(res, location, cookies = []) {
  const headers = { location, "cache-control": "no-store" };
  if (cookies.length > 0) headers["set-cookie"] = cookies;
  res.writeHead(303, headers);
  res.end();
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 32_000) {
        reject(new Error("Form is too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const params = new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
      resolve(Object.fromEntries(params));
    });
    req.on("error", reject);
  });
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 320;
}

function newOtp() {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

function headerSafe(value) {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function sendVerificationEmail(to, code) {
  const subject = "Your verification code";
  const text = `Your code is ${code}`;
  const payload = [
    `From: Fieldnote <${FROM_ADDRESS}>`,
    `To: ${headerSafe(to)}`,
    `Subject: ${subject}`,
    `Date: ${new Date().toUTCString()}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "",
    text,
  ].join("\r\n");

  const steps = [
    { code: 220, send: "EHLO fieldnote.test\r\n" },
    { code: 250, send: `MAIL FROM:<${FROM_ADDRESS}>\r\n` },
    { code: 250, send: `RCPT TO:<${headerSafe(to)}>\r\n` },
    { code: 250, send: "DATA\r\n" },
    { code: 354, send: `${payload}\r\n.\r\n` },
    { code: 250, send: "QUIT\r\n" },
  ];

  return new Promise((resolve, reject) => {
    const socket = net.connect(SMTP_PORT, SMTP_HOST);
    let buffer = "";
    let step = 0;
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(error);
    };
    const finish = () => {
      if (settled) return;
      settled = true;
      socket.end();
      resolve();
    };
    socket.setTimeout(8000, () => fail(new Error(`Timed out talking to SMTP ${SMTP_HOST}:${SMTP_PORT}`)));
    socket.on("error", (error) => fail(new Error(`Could not reach SMTP ${SMTP_HOST}:${SMTP_PORT} (${error.message})`)));
    const consume = () => {
      for (;;) {
        const lineEnd = buffer.indexOf("\r\n");
        if (lineEnd < 0) return;
        const line = buffer.slice(0, lineEnd);
        buffer = buffer.slice(lineEnd + 2);
        if (!/^\d{3}[ -]/.test(line)) continue;
        if (line[3] === "-") continue;
        const status = Number(line.slice(0, 3));
        const expected = steps[step];
        if (!expected) {
          finish();
          return;
        }
        if (status !== expected.code) {
          fail(new Error(`SMTP rejected the message: ${line}`));
          return;
        }
        socket.write(expected.send);
        step += 1;
      }
    };
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      try {
        consume();
      } catch (error) {
        fail(error);
      }
    });
    socket.on("close", () => {
      if (!settled && step >= steps.length) finish();
    });
  });
}

function currentUser(cookies) {
  const id = cookies.fieldnote_session;
  if (!id) return null;
  const session = sessions.get(id);
  if (!session) return null;
  return users.get(session.email) ?? null;
}

const server = createServer((req, res) => {
  void handle(req, res);
});

async function handle(req, res) {
  try {
    const url = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);
    const path = url.pathname;
    const method = req.method || "GET";
    const cookies = parseCookies(req.headers.cookie);
    const user = currentUser(cookies);

    if (method === "GET" && path === "/") {
      if (user?.verified) {
        redirect(res, "/dashboard");
        return;
      }
      send(res, 200, signupPage(""));
      return;
    }

    if (method === "POST" && path === "/signup") {
      const form = await readBody(req);
      const email = String(form.email || "").trim().toLowerCase();
      const password = String(form.password || "");
      if (!validEmail(email)) {
        send(res, 400, signupPage("Enter a valid email address."));
        return;
      }
      if (password.length < 8) {
        send(res, 400, signupPage("Use a password of at least 8 characters."));
        return;
      }
      const existing = users.get(email);
      if (existing?.verified) {
        send(res, 409, signupPage("That email is already verified. Log in instead."));
        return;
      }
      const otp = newOtp();
      users.set(email, {
        email,
        password,
        verified: false,
        otp,
        otpExpires: Date.now() + OTP_TTL_MS,
      });
      try {
        await sendVerificationEmail(email, otp);
      } catch (error) {
        users.delete(email);
        const detail = error instanceof Error ? error.message : "Could not send mail";
        send(res, 502, signupPage(`${detail} Create the inbox in Open-AgentMail first, then try again.`));
        return;
      }
      redirect(res, "/verify", [cookie("fieldnote_pending", email, 600)]);
      return;
    }

    if (method === "GET" && path === "/verify") {
      const email = cookies.fieldnote_pending || "";
      if (!email || !users.get(email)) {
        send(res, 200, verifyPage("", "Create an account first so we know where to send the code."));
        return;
      }
      send(res, 200, verifyPage(email, ""));
      return;
    }

    if (method === "POST" && path === "/verify") {
      const email = cookies.fieldnote_pending || "";
      const account = users.get(email);
      const form = await readBody(req);
      const otp = String(form.otp || "").trim();
      if (!account) {
        send(res, 400, verifyPage("", "Create an account first so we know where to send the code."));
        return;
      }
      if (!/^\d{6}$/.test(otp) || !account.otp || !safeEqual(account.otp, otp)) {
        send(res, 400, verifyPage(email, "That code doesn't match. Check the latest email and try again."));
        return;
      }
      if (Date.now() > account.otpExpires) {
        send(res, 400, verifyPage(email, "That code expired. Create the account again to send a new one."));
        return;
      }
      account.verified = true;
      account.otp = null;
      redirect(res, "/login?verified=1", [cookie("fieldnote_pending", "", 0)]);
      return;
    }

    if (method === "GET" && path === "/login") {
      if (user?.verified) {
        redirect(res, "/dashboard");
        return;
      }
      const verified = url.searchParams.get("verified") === "1";
      send(res, 200, loginPage(verified ? "Email verified. Log in to open your dashboard." : "", verified));
      return;
    }

    if (method === "POST" && path === "/login") {
      const form = await readBody(req);
      const email = String(form.email || "").trim().toLowerCase();
      const password = String(form.password || "");
      const account = users.get(email);
      if (!account || !safeEqual(account.password, password)) {
        send(res, 401, loginPage("Email or password doesn't match."));
        return;
      }
      if (!account.verified) {
        send(res, 403, loginPage("Verify your email before logging in."));
        return;
      }
      const id = randomBytes(24).toString("base64url");
      sessions.set(id, { email });
      redirect(res, "/dashboard", [cookie("fieldnote_session", id, 60 * 60 * 8)]);
      return;
    }

    if (method === "GET" && path === "/dashboard") {
      if (!user?.verified) {
        redirect(res, "/login");
        return;
      }
      send(res, 200, dashboardPage(user.email));
      return;
    }

    if (method === "POST" && path === "/logout") {
      if (cookies.fieldnote_session) sessions.delete(cookies.fieldnote_session);
      redirect(res, "/", [cookie("fieldnote_session", "", 0)]);
      return;
    }

    send(res, 404, page({
      title: "Not found",
      message: "That page doesn't exist.",
      body: `<h1>Not found</h1><p class="muted"><a href="/">Create account</a></p>`,
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Something went wrong";
    send(res, 500, page({
      title: "Error",
      message,
      body: `<h1>Something went wrong</h1><p class="muted"><a href="/">Back to signup</a></p>`,
    }));
  }
}

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Fieldnote listening on http://127.0.0.1:${PORT}`);
  console.log(`Verification mail goes to SMTP ${SMTP_HOST}:${SMTP_PORT}`);
});
