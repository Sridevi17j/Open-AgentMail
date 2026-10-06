import assert from "node:assert/strict";
import { test } from "node:test";

import { configFromEnv, parseCli } from "./config.js";

test("cli flags override defaults", () => {
  const parsed = parseCli([
    "serve",
    "--domain",
    "mail.example.com",
    "--smtp-port",
    "0",
    "--http-port",
    "0",
    "--no-persist",
    "--auto-create",
    "--ttl-seconds",
    "0",
  ]);
  assert.equal(parsed.command, "serve");
  assert.equal(parsed.config.domain, "mail.example.com");
  assert.equal(parsed.config.smtpPort, 0);
  assert.equal(parsed.config.persist, false);
  assert.equal(parsed.config.autoCreate, true);
  assert.equal(parsed.config.inboxTtlSeconds, 0);
});

test("rejects a domain that cannot receive mail", () => {
  assert.throws(() => parseCli(["mcp", "--domain", "not a domain"]), /domain/i);
});

test("OPEN_AGENTMAIL_* wins and AGENTBOX_* is the fallback", () => {
  const preferred = configFromEnv({
    OPEN_AGENTMAIL_DOMAIN: "mail.example.com",
    AGENTBOX_DOMAIN: "legacy.example.com",
    OPEN_AGENTMAIL_SMTP_PORT: "2526",
    AGENTBOX_HTTP_PORT: "8792",
  });
  assert.equal(preferred.domain, "mail.example.com");
  assert.equal(preferred.smtpPort, 2526);
  assert.equal(preferred.httpPort, 8792);

  const legacy = configFromEnv({
    AGENTBOX_DOMAIN: "legacy.example.com",
    AGENTBOX_AUTO_CREATE: "true",
    AGENTBOX_PERSIST: "false",
  });
  assert.equal(legacy.domain, "legacy.example.com");
  assert.equal(legacy.autoCreate, true);
  assert.equal(legacy.persist, false);
  assert.equal(legacy.smtpPort, 2525);
});
