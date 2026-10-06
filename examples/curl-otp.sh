#!/usr/bin/env bash
# Talks to a running Open-AgentMail HTTP server. Start one with: npm run dev
set -euo pipefail

base="${OPEN_AGENTMAIL_URL:-${AGENTBOX_URL:-http://127.0.0.1:8791}}"

inbox="$(curl -sf -X POST "$base/api/inboxes" -H 'content-type: application/json' -d '{}')"
id="$(node -e 'const inbox = JSON.parse(process.argv[1]); if (!inbox.inbox_id) process.exit(1); process.stdout.write(inbox.inbox_id)' "$inbox")"

curl -sf -X POST "$base/api/inboxes/$id/inject" \
  -H 'content-type: application/json' \
  -d '{"subject":"Your verification code","text":"Your code is 482913"}' >/dev/null

otp="$(curl -sf -X POST "$base/api/inboxes/$id/wait-otp" \
  -H 'content-type: application/json' \
  -d '{"timeout_ms":5000}')"

node -e 'const otp = JSON.parse(process.argv[1]); if (otp.code !== "482913") { console.error(otp); process.exit(1); }' "$otp"
echo "wait_for_otp returned 482913"
curl -sf -X DELETE "$base/api/inboxes/$id" >/dev/null
