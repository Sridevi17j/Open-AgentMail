import assert from "node:assert/strict";
import { test } from "node:test";

import { parseCli } from "./config.js";

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
