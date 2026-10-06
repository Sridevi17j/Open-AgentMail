# Open-AgentMail

Open-AgentMail is a self-hosted mailbox for AI agents doing UI tests. An agent creates a temporary inbox, uses that address to sign up or log in, reads the email OTP or magic link, then deletes the inbox.

It runs on your machine. There is no account, no API key, and no paid temp-mail service.

**Connect an agent:** [Claude Code, Codex CLI, and Cursor](docs/CONNECT.md). That guide has the `claude mcp add` command, the Codex `config.toml` table, and the Cursor `mcp.json` snippet.

```bash
npm install
npm run build
npm run mcp
```

`npm run mcp` speaks MCP on stdio and also listens for SMTP on `127.0.0.1:2525` and HTTP on `127.0.0.1:8791`. Logs go to stderr. stdout is the protocol.

## Scope

Open-AgentMail is for **email OTP, magic links, and a generated signup password**.

It is not for:

- Google, GitHub, Apple, Microsoft, SSO, or any other OAuth login
- SMS or phone verification
- Sending outbound mail as a product
- A hosted temp-mail SaaS

`temp.local` is for demos and for apps that you can point at this SMTP port. It is not a real public domain. Websites that block disposable domains, and websites on the public internet, will not deliver to it.

For those apps, use a domain you control and point its MX at this server. You are responsible for using that setup only on systems you are allowed to test.

Authorized staging and local end-to-end tests only. Do not use Open-AgentMail to break a site's terms, to create accounts you are not allowed to create, or to read mail that is not part of that test.

## Local test without a domain

Two paths prove the inbox works before you own a domain.

### Inject a code

This is the path to use when nothing can deliver real SMTP to `temp.local`.

```bash
npm run example:otp
```

That script creates an inbox, injects `Your code is 482913`, and checks that the wait call returns `482913`.

The same steps against a server you already started (`npm run dev`):

```bash
bash examples/curl-otp.sh
```

Or by hand:

```bash
curl -s -X POST http://127.0.0.1:8791/api/inboxes \
  -H 'content-type: application/json' -d '{}'
# copy inbox_id from the JSON

curl -s -X POST http://127.0.0.1:8791/api/inboxes/INBOX_ID/inject \
  -H 'content-type: application/json' \
  -d '{"subject":"Your verification code","text":"Your code is 482913"}'

curl -s -X POST http://127.0.0.1:8791/api/inboxes/INBOX_ID/wait-otp \
  -H 'content-type: application/json' \
  -d '{"timeout_ms":5000}'
```

The last response is `{ "code": "482913", "message_id": "...", "raw_snippet": "..." }`.

Open [the mailroom](http://127.0.0.1:8791) and use **Run sample OTP** to do this in the browser. The page is a local operator console, not a public site.

### Send SMTP

```bash
npm run example:smtp
```

That creates `smtp-demo@temp.local`, sends a message to the local SMTP port, and reads it back through the HTTP API.

Anything that can speak SMTP can do the same. Point the app under test at `127.0.0.1:2525` and the domain `temp.local`, or send with a one-off client. Unknown recipients are rejected until you create the inbox, unless you set `OPEN_AGENTMAIL_AUTO_CREATE=true`.

`password` in the create response is for the **signup form on the app you are testing**. Open-AgentMail does not ask for it to read mail. On localhost, the HTTP API is open because it is bound to loopback. Do not expose that port.

A Playwright sketch of the same sequence lives in [examples/playwright-pattern.md](examples/playwright-pattern.md). The runnable app under test is [Fieldnote](examples/demo-app/README.md): `npm start` in one terminal and `npm run demo` in another, then open http://localhost:3000. It is documentation, not a bundled test.

## Configure Cursor

Build first so `dist/cli.js` exists. The copy-paste setup for Cursor, Claude Code, and Codex is [docs/CONNECT.md](docs/CONNECT.md). In Cursor MCP settings, add a stdio server:

```json
{
  "mcpServers": {
    "open-agentmail": {
      "command": "node",
      "args": ["/absolute/path/to/open-agentmail/dist/cli.js", "mcp"],
      "cwd": "/absolute/path/to/open-agentmail",
      "env": {
        "OPEN_AGENTMAIL_DOMAIN": "temp.local",
        "OPEN_AGENTMAIL_SMTP_HOST": "127.0.0.1",
        "OPEN_AGENTMAIL_SMTP_PORT": "2525",
        "OPEN_AGENTMAIL_HTTP_PORT": "8791",
        "OPEN_AGENTMAIL_PERSIST": "true",
        "OPEN_AGENTMAIL_DATA_DIR": "./data"
      }
    }
  }
}
```

Claude Desktop and other MCP hosts use the same command. During development, `npx tsx src/cli.ts mcp` skips the build step.

Copy the skill so the agent follows the email-only flow:

```bash
mkdir -p .cursor/skills
ln -s ../../skills/ui-email-auth .cursor/skills/ui-email-auth
```

The skill source is [skills/ui-email-auth/SKILL.md](skills/ui-email-auth/SKILL.md).

## Tools

| Tool | What it returns |
| --- | --- |
| `create_inbox` | `address`, `password`, `inbox_id`, `expires_at` |
| `list_messages` | Newest first: `id`, `subject`, `from`, `received_at`, `snippet` |
| `get_message` | Full `text` and `html` |
| `wait_for_otp` | `code`, `message_id`, `raw_snippet` |
| `wait_for_link` | `url`, `message_id`, `raw_snippet` |
| `delete_inbox` | Deletes the inbox and its messages |
| `inject_message` | Dev only. Inserts a message without SMTP |

Pass `inbox_id` or `address`. Pass `not_before` (ISO time captured just before submit) so a previous code in the same inbox is ignored.

`wait_for_otp` looks for a 4–8 digit code next to words like code, OTP, or verification. Set `regex` to override it. If the pattern has a capture group, that group is the code. `wait_for_link` prefers verify and login URLs and skips unsubscribe links and images. Still check the host before you open a link.

The default timeout is 30 seconds. The maximum is 180 seconds.

## HTTP API

The HTTP server is optional glue for scripts and the mailroom page. MCP is the agent interface.

| Method | Path |
| --- | --- |
| `GET` | `/health` |
| `GET` | `/` |
| `POST` | `/api/inboxes` |
| `GET` | `/api/inboxes` |
| `GET` | `/api/inboxes/:id` |
| `DELETE` | `/api/inboxes/:id` |
| `GET` | `/api/inboxes/:id/messages` |
| `GET` | `/api/inboxes/:id/messages/:messageId` |
| `POST` | `/api/inboxes/:id/inject` |
| `POST` | `/api/inboxes/:id/wait-otp` |
| `POST` | `/api/inboxes/:id/wait-link` |

If `OPEN_AGENTMAIL_API_TOKEN` is set, API routes require `Authorization: Bearer <token>`. `/health` and the HTML page stay open. Binding HTTP on a non-loopback address without a token is refused.

## Configuration

Environment variables and flags use the same settings. See [.env.example](.env.example). Open-AgentMail does not load `.env` by itself. `AGENTBOX_*` still applies when the matching `OPEN_AGENTMAIL_*` variable is unset.

| Variable | Default | Flag |
| --- | --- | --- |
| `OPEN_AGENTMAIL_DOMAIN` | `temp.local` | `--domain` |
| `OPEN_AGENTMAIL_SMTP_HOST` | `127.0.0.1` | `--smtp-host` |
| `OPEN_AGENTMAIL_SMTP_PORT` | `2525` | `--smtp-port` |
| `OPEN_AGENTMAIL_HTTP_HOST` | `127.0.0.1` | `--http-host` |
| `OPEN_AGENTMAIL_HTTP_PORT` | `8791` | `--http-port` |
| `OPEN_AGENTMAIL_DATA_DIR` | `./data` | `--data-dir` |
| `OPEN_AGENTMAIL_PERSIST` | `true` | `--no-persist` |
| `OPEN_AGENTMAIL_AUTO_CREATE` | `false` | `--auto-create` |
| `OPEN_AGENTMAIL_INBOX_TTL_SECONDS` | `3600` | `--ttl-seconds` |
| `OPEN_AGENTMAIL_API_TOKEN` | unset | |
| `OPEN_AGENTMAIL_SMTP_ENABLED` / `OPEN_AGENTMAIL_HTTP_ENABLED` | `true` | `--no-smtp` / `--no-http` |

`0` for the TTL keeps an inbox until `delete_inbox`. Expired inboxes are removed on the next read and by a once-a-minute sweep in the process. The store is `data/store.json`. It contains message bodies, including codes. Do not commit it.

Commands:

```bash
npm run dev       # tsx, HTTP + SMTP, no MCP
npm start         # node dist/cli.js serve
npm run mcp       # node dist/cli.js mcp
npm test
```

Node.js 20 or newer.

## A real domain later

`temp.local` will not receive mail from Gmail or from a SaaS app on the internet. Many sites also reject domains that look disposable. Use a domain you own.

1. Pick the domain Open-AgentMail should accept, for example `test.example.com`.
2. Publish DNS:
   - `test.example.com` MX `10` `mail.example.com`
   - `mail.example.com` A or AAAA pointing at the host running Open-AgentMail
3. Let the host receive TCP port 25. Binding port 25 usually needs extra privileges, so you can listen on `2525` and forward `25 → 2525` on the firewall.
4. Start Open-AgentMail with SMTP on a public interface and HTTP still on localhost:

```bash
OPEN_AGENTMAIL_DOMAIN=test.example.com \
OPEN_AGENTMAIL_SMTP_HOST=0.0.0.0 \
OPEN_AGENTMAIL_SMTP_PORT=25 \
OPEN_AGENTMAIL_HTTP_HOST=127.0.0.1 \
npm start
```

Create inboxes as `something@test.example.com` before the app sends, or set `OPEN_AGENTMAIL_AUTO_CREATE=true` if you want the first delivery to create the mailbox. Keep the HTTP port on loopback. That port can read every code in the store.

This MVP does not send mail, sign messages with DKIM, or run a spam filter. A public listener will get probes. Run it on a host you control, for staging domains you control.

### Cloudflare

Not implemented. A later adapter could use Cloudflare Email Routing plus a Worker that POSTs the parsed message into the local inject API, which avoids binding port 25. Until that exists, MX to this process is the production path.

## What's next

- Cloudflare Email Routing / Worker webhook, so inbound mail does not require port 25
- A signed webhook mode for hosts that already parse inbound mail
- A separate TTL worker for more than one process (this process already sweeps once a minute)
- Per-inbox read tokens, so a shared HTTP port cannot list every mailbox
- Outbound mail stays out of scope

## Development

```bash
npm install
npm test
npm run build
npm run smoke
```

`npm test` starts the server in-process and through `tsx`. `npm run smoke` runs the same MCP scenario against `dist/cli.js`.

## License

MIT. See [LICENSE](LICENSE).
