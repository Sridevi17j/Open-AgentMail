---
name: ui-email-auth
description: >-
  Sign up or log in during an authorized UI test with a temporary Open-AgentMail
  email inbox, then read an OTP or magic link. Use when a flow needs email
  verification, a one-time code, a magic link, or a generated signup password.
  Do not use for Google, GitHub, Apple, SSO, or any other OAuth provider, and
  do not use for SMS.
---

# UI email auth with Open-AgentMail

Open-AgentMail is a local mailbox for tests. It is not a login broker and it does not talk to Gmail, GitHub, or any paid temp-mail API.

## When to use

Use this skill when the app under test asks a person to:

- type an email address and a password, then confirm with a code sent to that inbox
- request a one-time code sent by email
- click a magic link sent by email

The app must be one you are allowed to test, usually a local or staging build.

## When not to use

- Google, GitHub, Apple, Microsoft, SSO, SAML, or any other OAuth / social login
- SMS, voice, or authenticator-app codes
- A real person's inbox, or a production customer account
- A site whose terms you are not allowed to exercise with automated signups

If the only path is OAuth, stop and say so. Do not invent an email workaround.

## Before you start

The `open-agentmail` MCP server must be connected. It listens for MCP on stdio and, by default, for SMTP on `127.0.0.1:2525` and HTTP on `127.0.0.1:8791`.

`temp.local` is the default domain. Mail addressed to it is delivered only if the app sends it to this Open-AgentMail SMTP port, or if you insert it with `inject_message`. Public websites cannot resolve `temp.local`. For a real staging host, Open-AgentMail has to run on a domain you control, with that domain's MX pointed at the machine. See the project README.

## Steps

1. Call `create_inbox`.
   Keep `address`, `password`, `inbox_id`, and `expires_at`.
   `password` is a random string for the **app under test**. It is not a mailbox password. Open-AgentMail does not authenticate readers with it.
2. Open the signup or login form.
   Put `address` in the email field.
   If the form has a password field, use `password`.
3. Record `not_before` as the current ISO time **immediately before** you submit the form.
4. Submit the form.
5. Call one of:
   - `wait_for_otp` for a numeric code
   - `wait_for_link` for a magic link
   Pass `inbox_id` and `not_before`. A 30 second timeout is the default. Staging mail can be slower; raise `timeout_ms` up to 180000 and then stop.
6. Finish the form.
   Type `code` into the verification field.
   For a link, open `url` only after you check that its host is the app under test. Do not open unsubscribe or tracking links. The tool already tries to skip those, and you should still look.
7. Call `delete_inbox` when the attempt is finished. Do this on failure too, so the next run does not read a stale code.

## Stale codes

Always pass `not_before`. A second login on the same inbox must not reuse the first code.

Prefer a new inbox per attempt. If you keep one inbox, `not_before` is what separates the new message from the old one.

If `wait_for_otp` times out:

- Call `list_messages` once.
- If a new message is there but the code was not found, read it with `get_message` and, if the format is obvious, call `wait_for_otp` again with a `regex` that has one capture group.
- If no message arrived, do not invent a code. Say that mail did not arrive. On `temp.local`, that usually means the app never delivered to this SMTP server.

## Local demo without a domain

`inject_message` writes a message straight into the inbox. Use it when you are checking the harness, or when the app under test cannot send mail to `temp.local`.

Example body: `Your code is 482913`. `wait_for_otp` should return `482913`.

Do not use `inject_message` to fake a passing test of a real mail delivery path.

## Timeouts and filters

| Argument | Default | Use |
| --- | --- | --- |
| `timeout_ms` | 30000 | Stop after this long. Maximum 180000. |
| `interval_ms` | 500 | How often to look. |
| `not_before` | none | ISO time. Ignore older messages. |
| `subject` / `from` | none | Case-insensitive substrings. |
| `regex` | built in | Optional. A capture group is the value returned. |

The built-in OTP extractor looks for 4–8 digits next to words like code, OTP, PIN, or verification. A bare year such as 2026 is ignored unless it sits next to one of those words.

## Staging only

Authorized end-to-end tests and staging systems only. Do not use Open-AgentMail to create accounts on third-party services in violation of their terms, to hide abuse, or to collect mail you are not allowed to read.
