# Connect Open-AgentMail to an agent

Open-AgentMail is a local stdio MCP server. Claude Code, Codex CLI, and Cursor each start it with `node` and talk to it on stdin/stdout. The same process receives SMTP on `127.0.0.1:2525`.

Use it for email OTP, magic links, and a generated signup password on an app you are allowed to test. It does not sign in with Google, GitHub, or any other OAuth, and it does not do SMS.

## Prerequisites

Node.js 20 or newer.

```bash
git clone https://github.com/Sridevi17j/Open-AgentMail
cd Open-AgentMail
npm install
npm run build
```

`dist/cli.js` must exist before you add the server. Replace `/path/to/open-agentmail` below with the absolute path of that checkout (`pwd`).

Do not point a client at `npm run mcp`. npm prints a banner on stdout and that breaks the MCP stream. The command is `node` with the built file.

## Environment

Set these in the client config. Open-AgentMail does not read a `.env` file. Older `AGENTBOX_*` names still work when the matching `OPEN_AGENTMAIL_*` variable is unset.

| Variable | Default | Role |
| --- | --- | --- |
| `OPEN_AGENTMAIL_DOMAIN` | `temp.local` | Addresses look like `name@temp.local` |
| `OPEN_AGENTMAIL_SMTP_HOST` | `127.0.0.1` | SMTP bind address |
| `OPEN_AGENTMAIL_SMTP_PORT` | `2525` | SMTP port |
| `OPEN_AGENTMAIL_HTTP_HOST` | `127.0.0.1` | Mailroom bind address |
| `OPEN_AGENTMAIL_HTTP_PORT` | `8791` | Mailroom and HTTP API |
| `OPEN_AGENTMAIL_DATA_DIR` | `./data` | JSON store. Use an absolute path in client config |
| `OPEN_AGENTMAIL_PERSIST` | `true` | `false` keeps mail in memory only |

`temp.local` only accepts mail delivered to this SMTP port. A public website needs a domain you control. See [A real domain](#mail-never-arrives) below.

## Claude Code

User scope stores the server in `~/.claude.json` and makes it available in every project. Project scope writes `.mcp.json` in the repo you are testing; Claude asks you to approve that file the first time you run `claude` there.

Stdio is the default transport. The `--` separates Claude's flags from the server command. Put `--transport` (or another Claude flag) after the `--env` flags so the server name is not parsed as another `KEY=value` pair.

```bash
claude mcp add \
  --env OPEN_AGENTMAIL_DOMAIN=temp.local \
  --env OPEN_AGENTMAIL_SMTP_HOST=127.0.0.1 \
  --env OPEN_AGENTMAIL_SMTP_PORT=2525 \
  --env OPEN_AGENTMAIL_HTTP_PORT=8791 \
  --env OPEN_AGENTMAIL_PERSIST=true \
  --env OPEN_AGENTMAIL_DATA_DIR=/path/to/open-agentmail/data \
  --transport stdio \
  --scope user \
  open-agentmail \
  -- node /path/to/open-agentmail/dist/cli.js mcp
```

Drop `--scope user` for local scope (this project only), or use `--scope project` to write `.mcp.json`.

The same server as JSON, for `.mcp.json` or `claude mcp add-json`:

```json
{
  "mcpServers": {
    "open-agentmail": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/open-agentmail/dist/cli.js", "mcp"],
      "env": {
        "OPEN_AGENTMAIL_DOMAIN": "temp.local",
        "OPEN_AGENTMAIL_SMTP_HOST": "127.0.0.1",
        "OPEN_AGENTMAIL_SMTP_PORT": "2525",
        "OPEN_AGENTMAIL_HTTP_PORT": "8791",
        "OPEN_AGENTMAIL_PERSIST": "true",
        "OPEN_AGENTMAIL_DATA_DIR": "/path/to/open-agentmail/data"
      }
    }
  }
}
```

```bash
claude mcp add-json --scope user open-agentmail '{"type":"stdio","command":"node","args":["/path/to/open-agentmail/dist/cli.js","mcp"],"env":{"OPEN_AGENTMAIL_DOMAIN":"temp.local","OPEN_AGENTMAIL_SMTP_HOST":"127.0.0.1","OPEN_AGENTMAIL_SMTP_PORT":"2525","OPEN_AGENTMAIL_HTTP_PORT":"8791","OPEN_AGENTMAIL_PERSIST":"true","OPEN_AGENTMAIL_DATA_DIR":"/path/to/open-agentmail/data"}}'
```

Check it, then start a new session:

```bash
claude mcp get open-agentmail
claude mcp list
```

`claude mcp list` should show `open-agentmail` as connected. A project server stays on `Pending approval` until you run `claude` in that directory and accept it. Inside a session, `/mcp` shows the same server.

In `.mcp.json`, `${VAR}` and `${VAR:-default}` expand in `command`, `args`, and `env`. A checked-in path can be `"${OPEN_AGENTMAIL_ROOT}/dist/cli.js"` if every machine exports `OPEN_AGENTMAIL_ROOT`.

### Skill

Claude Code reads `SKILL.md` from `.claude/skills/<name>/` in the project and from `~/.claude/skills/<name>/` for every project.

```bash
mkdir -p ~/.claude/skills
ln -sfn /path/to/open-agentmail/skills/ui-email-auth ~/.claude/skills/ui-email-auth
```

From a checkout of this repo, a project-local link is:

```bash
mkdir -p .claude/skills
ln -sfn ../../skills/ui-email-auth .claude/skills/ui-email-auth
```

Restart the session. `/skills` should list `ui-email-auth`. Invoke it with `/ui-email-auth`.

## Codex CLI

`codex mcp add` writes the global file `~/.codex/config.toml`. The ChatGPT desktop app and the IDE extension read that same file. A project file `.codex/config.toml` is loaded only after you trust the project.

```bash
codex mcp add open-agentmail \
  --env OPEN_AGENTMAIL_DOMAIN=temp.local \
  --env OPEN_AGENTMAIL_SMTP_HOST=127.0.0.1 \
  --env OPEN_AGENTMAIL_SMTP_PORT=2525 \
  --env OPEN_AGENTMAIL_HTTP_PORT=8791 \
  --env OPEN_AGENTMAIL_PERSIST=true \
  --env OPEN_AGENTMAIL_DATA_DIR=/path/to/open-agentmail/data \
  -- node /path/to/open-agentmail/dist/cli.js mcp
```

Equivalent table, if you edit the file yourself:

```toml
[mcp_servers.open-agentmail]
command = "node"
args = ["/path/to/open-agentmail/dist/cli.js", "mcp"]

[mcp_servers.open-agentmail.env]
OPEN_AGENTMAIL_DOMAIN = "temp.local"
OPEN_AGENTMAIL_SMTP_HOST = "127.0.0.1"
OPEN_AGENTMAIL_SMTP_PORT = "2525"
OPEN_AGENTMAIL_HTTP_PORT = "8791"
OPEN_AGENTMAIL_PERSIST = "true"
OPEN_AGENTMAIL_DATA_DIR = "/path/to/open-agentmail/data"
```

`env_vars` is a different setting. It names extra variables to pass through. Put Open-AgentMail values in `[mcp_servers.open-agentmail.env]`, as above.

```bash
codex mcp get open-agentmail
codex mcp list
```

Start a new Codex session after changing `config.toml`.

### Skill

Codex scans `.agents/skills` from the current directory up to the repo root, and `~/.agents/skills` for every project. Symlinks are followed.

```bash
mkdir -p ~/.agents/skills
ln -sfn /path/to/open-agentmail/skills/ui-email-auth ~/.agents/skills/ui-email-auth
```

In this repo:

```bash
mkdir -p .agents/skills
ln -sfn ../../skills/ui-email-auth .agents/skills/ui-email-auth
```

Restart Codex if the new skill does not appear. In the CLI, `/skills` lists it and `$ui-email-auth` invokes it.

`AGENTS.md` is not the skill file. Codex reads it as standing instructions for the repo. In the app you are testing, a short pointer helps the agent pick the skill:

```markdown
## Email signup and login

When a flow sends an email OTP or magic link, follow the `ui-email-auth` skill.
Create an Open-AgentMail inbox, submit the form, read the code or link, then delete the inbox.
Do not use Google, GitHub, or any other OAuth login.
```

## Cursor

Put this in the project `.cursor/mcp.json`, or in `~/.cursor/mcp.json` for every project. Restart Cursor, or reload MCP servers from settings, after saving.

```json
{
  "mcpServers": {
    "open-agentmail": {
      "command": "node",
      "args": ["/path/to/open-agentmail/dist/cli.js", "mcp"],
      "cwd": "/path/to/open-agentmail",
      "env": {
        "OPEN_AGENTMAIL_DOMAIN": "temp.local",
        "OPEN_AGENTMAIL_SMTP_HOST": "127.0.0.1",
        "OPEN_AGENTMAIL_SMTP_PORT": "2525",
        "OPEN_AGENTMAIL_HTTP_PORT": "8791",
        "OPEN_AGENTMAIL_PERSIST": "true",
        "OPEN_AGENTMAIL_DATA_DIR": "/path/to/open-agentmail/data"
      }
    }
  }
}
```

Settings should list the `open-agentmail` server and its tools: `create_inbox`, `list_messages`, `get_message`, `wait_for_otp`, `wait_for_link`, `delete_inbox`, `inject_message`.

### Skill

```bash
mkdir -p ~/.cursor/skills
ln -sfn /path/to/open-agentmail/skills/ui-email-auth ~/.cursor/skills/ui-email-auth
```

This repo already links the skill at `.cursor/skills/ui-email-auth`. In another project:

```bash
mkdir -p .cursor/skills
ln -sfn /path/to/open-agentmail/skills/ui-email-auth .cursor/skills/ui-email-auth
```

## Check that the tools work

After the server is connected, ask:

```text
Create a temp inbox, inject a test OTP email "Your code is 482913", and wait for the OTP.
```

The reply should include an address ending in `@temp.local` and the code `482913`. Then ask it to delete that inbox.

You can watch the same messages at `http://127.0.0.1:8791` while the agent session is running. That page is served by the MCP process. A second `npm run dev` on port 2525 or 8791 will fail to bind.

## UI test prompt

Use this only on a local or staging app you are allowed to test. Point that app's mailer at `127.0.0.1:2525` if it must deliver to `temp.local`. Otherwise the message never arrives, and `inject_message` would only fake the result.

Fieldnote, in `examples/demo-app`, is a local app that already sends mail to Open-AgentMail. Start it with `npm run demo` (http://localhost:3000) while Open-AgentMail is running. See [examples/demo-app/README.md](../examples/demo-app/README.md).

```text
Use open-agentmail to test signup and login on http://localhost:3000
```

That should end on the Fieldnote dashboard: `Welcome, <inbox address>`.

```text
Use the ui-email-auth skill. Sign up on http://localhost:3000 with a new Open-AgentMail inbox.
Record the time before you submit. Fill #email with the inbox address and #password
with the generated password, then click Create account. Wait for the email OTP (not a
Google or GitHub login). Enter the code in #otp and click Verify. Log in, confirm the
dashboard greets that email, then delete the inbox even if a step fails.
```

For a magic link, say `wait_for_link` and tell the agent to open the URL only if its host is the app under test.

## Troubleshooting

### Port already in use

Only one Open-AgentMail process can bind `2525` and `8791`. Stop `npm run dev`, `npm start`, or another client session that already launched the server. Or set `OPEN_AGENTMAIL_SMTP_PORT` and `OPEN_AGENTMAIL_HTTP_PORT` to a free pair in that client's env.

### Stdout must stay empty

MCP frames are the only bytes on stdout. Open-AgentMail logs on stderr. If the client reports a connection error or invalid JSON:

- Launch `node /path/to/open-agentmail/dist/cli.js mcp`, not `npm run mcp` and not a wrapper that echoes.
- Do not add `console.log` in front of the server.
- Run `node /path/to/open-agentmail/dist/cli.js mcp` in a terminal. You should see logs on the terminal (stderr) and no prompt. It waits for a client. Ctrl-C stops it. Do not leave that process running if a client will start its own.

### Mail never arrives

`name@temp.local` is not a public mailbox. Gmail and most websites cannot route it. Mail is stored only when:

- the app sends SMTP to `127.0.0.1:2525` for a domain Open-AgentMail is configured to accept, or
- the agent calls `inject_message` for a local dry run.

For a real staging site, use a domain you own, publish an MX record to the host running Open-AgentMail, and set `OPEN_AGENTMAIL_DOMAIN` to that domain. Keep the HTTP port on `127.0.0.1`. Details are in the README section "A real domain later".

If a message is in the inbox but `wait_for_otp` times out, the body may not match the default 4–8 digit pattern. Ask the agent to `list_messages`, then retry with a `regex` that has one capture group. Pass `not_before` from just before the form submit so an older code is ignored.

### Server is configured but has no tools

`claude mcp list` or `codex mcp list` shows a failure, or Cursor shows the server disconnected.

- `dist/cli.js` is missing: run `npm run build`.
- The path in `command` / `args` is wrong, or it is not absolute.
- A project `.mcp.json` is still waiting for approval. Run `claude` and accept it.
- Codex was not restarted after `config.toml` changed.
- Ports are taken, so the process exits before it accepts MCP. The client stderr log shows `EADDRINUSE`.
