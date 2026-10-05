#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { Agentbox } from "./app.js";
import { helpText, parseCli } from "./config.js";
import { log } from "./log.js";
import { attachMcp } from "./mcp.js";
import { VERSION } from "./version.js";

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    console.error(helpText());
    process.exit(argv.length === 0 ? 1 : 0);
  }

  const { command, config } = parseCli(argv);
  if (command !== "mcp" && command !== "serve") {
    throw new Error(`Unknown command "${command}". Use "agentbox mcp" or "agentbox serve".`);
  }
  if (!config.smtpEnabled && !config.httpEnabled && command === "serve") {
    throw new Error("serve needs SMTP, HTTP, or both. Remove --no-smtp or --no-http.");
  }

  const app = new Agentbox(config);
  await app.start();
  log.info(`Agentbox ${VERSION} ready for @${config.domain}`);
  if (config.smtpEnabled) log.info(`smtp listening on ${config.smtpHost}:${app.smtpPort}`);
  if (config.httpEnabled) log.info(`http listening on http://${config.httpHost}:${app.httpPort}`);
  if (!isPublicMailDomain(config.domain)) {
    log.info("temp.local accepts mail only from this machine. A public site needs your own domain and MX.");
  }

  let closing = false;
  const shutdown = (exitCode: number) => {
    if (closing) return;
    closing = true;
    void app.stop().finally(() => process.exit(exitCode));
  };
  process.on("SIGINT", () => shutdown(0));
  process.on("SIGTERM", () => shutdown(0));

  if (command === "mcp") {
    const server = new McpServer({ name: "agentbox", version: VERSION });
    attachMcp(server, app.actions);
    const transport = new StdioServerTransport();
    await server.connect(transport);
    const previous = transport.onclose;
    transport.onclose = () => {
      previous?.();
      shutdown(0);
    };
  }
}

function isPublicMailDomain(domain: string): boolean {
  return !domain.endsWith(".local") && domain !== "localhost";
}

main().catch((error: unknown) => {
  log.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
