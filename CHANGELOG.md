# Changelog

## 0.1.0

- Local MCP server with `create_inbox`, `list_messages`, `get_message`, `wait_for_otp`, `wait_for_link`, `delete_inbox`, and dev-only `inject_message`.
- SMTP catcher on `127.0.0.1:2525` for the `temp.local` domain, plus an optional JSON store under `./data`.
- Local HTTP mailroom and API on `127.0.0.1:8791`.
- Cursor skill for the email OTP / magic-link UI-test flow.
- Setup guide for Claude Code, Codex CLI, and Cursor in `docs/CONNECT.md`.
- Fieldnote demo app in `examples/demo-app` for email-OTP signup against the local SMTP port.
