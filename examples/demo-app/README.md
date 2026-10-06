# Fieldnote demo

A tiny local app for trying Open-AgentMail on a real signup flow. It keeps users in memory and emails a 6-digit code through SMTP. Nothing here is a production login system.

## Run both

Terminal 1, from the Open-AgentMail repo:

```bash
npm install
npm run build
npm start
```

Open-AgentMail listens for SMTP on `127.0.0.1:2525` and serves the mailroom at `http://127.0.0.1:8791`.

Terminal 2:

```bash
npm run demo
```

Or:

```bash
cd examples/demo-app
npm start
```

Fieldnote is at [http://localhost:3000](http://localhost:3000). No extra install. It has no dependencies.

| Page | What it does |
| --- | --- |
| `/` | Create account (`#email`, `#password`, button **Create account**) |
| `/verify` | Enter the code (`#otp`, button **Verify**) |
| `/login` | Log in after the code is verified (`#email`, `#password`, button **Log in**) |
| `/dashboard` | `Welcome, <email>` and **Log out** |

The verification message subject is `Your verification code` and the body is `Your code is 123456` (a new code each time). Fieldnote sends it to `127.0.0.1:2525`. Override the destination with `SMTP_HOST` and `SMTP_PORT`.

Create the Open-AgentMail inbox **before** submitting the form. `temp.local` is rejected until that inbox exists.

## Codex prompt

With Open-AgentMail connected (see [docs/CONNECT.md](../../docs/CONNECT.md)) and both processes running:

```text
Use open-agentmail to test signup and login on http://localhost:3000
```

Expected result: the agent creates an inbox, submits **Create account** with that address and the generated password, reads the code from SMTP with `wait_for_otp`, submits **Verify**, logs in, and reaches the dashboard. The page shows `Welcome, <inbox address>`.

A fuller prompt:

```text
Use the ui-email-auth skill. Test signup and login on http://localhost:3000.
Create an Open-AgentMail inbox first. On the signup page, use #email and #password,
then click Create account. Wait for the OTP from real mail (subject
"Your verification code"). Enter it in #otp and click Verify. Then log in
with the same email and password. Stop when the dashboard says Welcome
and shows that email. Delete the inbox when you are done, including on failure.
Do not use Google, GitHub, or any other OAuth.
```
