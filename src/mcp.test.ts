import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import { sendSmtpMessage } from "./smtp-send.js";
import { reservePort } from "./smtp.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function childEnv(extra: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string" && !key.startsWith("OPEN_AGENTMAIL_") && !key.startsWith("AGENTBOX_")) {
      env[key] = value;
    }
  }
  return { ...env, ...extra };
}

function asRecord(result: unknown): Record<string, unknown> {
  const value = result as {
    isError?: boolean;
    content?: { type: string; text?: string }[];
    structuredContent?: Record<string, unknown>;
  };
  if (value.isError) {
    throw new Error(value.content?.map((item) => item.text ?? "").join("\n") || "tool failed");
  }
  if (value.structuredContent) return value.structuredContent;
  const text = value.content?.find((item) => item.type === "text")?.text ?? "";
  return JSON.parse(text) as Record<string, unknown>;
}

test("mcp create, inject, smtp, and wait_for_otp", { timeout: 25_000 }, async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "open-agentmail-mcp-"));
  const smtpPort = await reservePort();
  const httpPort = await reservePort();
  const useDist = process.env.OPEN_AGENTMAIL_SMOKE_DIST === "1" || process.env.AGENTBOX_SMOKE_DIST === "1";
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: useDist ? [join(root, "dist", "cli.js"), "mcp"] : ["--import", "tsx", join(root, "src", "cli.ts"), "mcp"],
    cwd: root,
    env: childEnv({
      OPEN_AGENTMAIL_DOMAIN: "temp.local",
      OPEN_AGENTMAIL_SMTP_HOST: "127.0.0.1",
      OPEN_AGENTMAIL_SMTP_PORT: String(smtpPort),
      OPEN_AGENTMAIL_HTTP_HOST: "127.0.0.1",
      OPEN_AGENTMAIL_HTTP_PORT: String(httpPort),
      OPEN_AGENTMAIL_PERSIST: "false",
      OPEN_AGENTMAIL_DATA_DIR: dataDir,
      OPEN_AGENTMAIL_AUTO_CREATE: "false",
      OPEN_AGENTMAIL_INBOX_TTL_SECONDS: "3600",
    }),
    stderr: "pipe",
  });
  const stderr: string[] = [];
  transport.stderr?.on("data", (chunk: Buffer | string) => {
    stderr.push(String(chunk));
  });
  const client = new Client({ name: "open-agentmail-test", version: "0.0.0" });
  try {
    await client.connect(transport);
    const listed = await client.listTools();
    assert.deepEqual(
      listed.tools.map((tool) => tool.name).sort(),
      ["create_inbox", "delete_inbox", "get_message", "inject_message", "list_messages", "wait_for_link", "wait_for_otp"],
    );

    const created = asRecord(await client.callTool({ name: "create_inbox", arguments: {} }));
    const inboxId = String(created.inbox_id);
    const address = String(created.address);
    assert.match(address, /@temp\.local$/);
    assert.equal(typeof created.password, "string");

    await client.callTool({
      name: "inject_message",
      arguments: {
        inbox_id: inboxId,
        subject: "Your verification code",
        text: "Your code is 482913",
      },
    });
    const otp = asRecord(
      await client.callTool({
        name: "wait_for_otp",
        arguments: { inbox_id: inboxId, timeout_ms: 1_000 },
      }),
    );
    assert.equal(otp.code, "482913");

    const smtpInbox = asRecord(
      await client.callTool({ name: "create_inbox", arguments: { local_part: "from-smtp" } }),
    );
    await sendSmtpMessage({
      port: smtpPort,
      from: "app@example.com",
      to: String(smtpInbox.address),
      subject: "Login code",
      text: "Your code is 998877",
    });
    const messages = asRecord(
      await client.callTool({
        name: "list_messages",
        arguments: { inbox_id: String(smtpInbox.inbox_id) },
      }),
    );
    const rows = messages.messages as { id: string; snippet: string }[];
    assert.match(rows[0]?.snippet ?? "", /998877/);
    const full = asRecord(
      await client.callTool({
        name: "get_message",
        arguments: { inbox_id: String(smtpInbox.inbox_id), message_id: rows[0]?.id },
      }),
    );
    assert.match(String(full.text), /998877/);

    await client.callTool({
      name: "inject_message",
      arguments: {
        inbox_id: inboxId,
        subject: "Sign in",
        text: "Use the link",
        html: '<a href="https://app.test/unsubscribe">x</a><a href="https://app.test/verify?token=abc">in</a>',
      },
    });
    const link = asRecord(
      await client.callTool({
        name: "wait_for_link",
        arguments: { inbox_id: inboxId, timeout_ms: 1_000, subject: "Sign in" },
      }),
    );
    assert.equal(link.url, "https://app.test/verify?token=abc");

    const removed = asRecord(await client.callTool({ name: "delete_inbox", arguments: { inbox_id: inboxId } }));
    assert.equal(removed.deleted, true);
    const missing = await client.callTool({ name: "list_messages", arguments: { inbox_id: inboxId } });
    assert.equal((missing as { isError?: boolean }).isError, true);
  } catch (error) {
    if (stderr.length > 0) {
      console.error(stderr.join(""));
    }
    throw error;
  } finally {
    await client.close();
  }
});
