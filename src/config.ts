import { isValidDomain } from "./passwords.js";

export interface Config {
  domain: string;
  smtpHost: string;
  smtpPort: number;
  smtpEnabled: boolean;
  httpHost: string;
  httpPort: number;
  httpEnabled: boolean;
  dataDir: string;
  persist: boolean;
  autoCreate: boolean;
  inboxTtlSeconds: number;
  apiToken: string | null;
  allowOpenHttp: boolean;
  maxMessagesPerInbox: number;
  maxBodyChars: number;
}

export interface ParsedCli {
  command: string;
  config: Config;
}

function envString(name: string, fallback: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") return fallback;
  return value.trim();
}

function envBool(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  throw new Error(`${name} must be true or false`);
}

function parsePort(raw: string, label: string): number {
  if (!/^\d+$/.test(raw)) throw new Error(`${label} must be an integer port`);
  const port = Number(raw);
  if (port < 0 || port > 65535) throw new Error(`${label} must be between 0 and 65535`);
  return port;
}

function envPort(name: string, fallback: number): number {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") return fallback;
  return parsePort(value.trim(), name);
}

function envInt(name: string, fallback: number, min: number, max: number): number {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") return fallback;
  if (!/^\d+$/.test(value.trim())) throw new Error(`${name} must be an integer`);
  const parsed = Number(value.trim());
  if (parsed < min || parsed > max) throw new Error(`${name} must be between ${min} and ${max}`);
  return parsed;
}

export function configFromEnv(): Config {
  const domain = envString("AGENTBOX_DOMAIN", "temp.local").toLowerCase();
  if (!isValidDomain(domain)) {
    throw new Error(`AGENTBOX_DOMAIN "${domain}" is not a valid domain`);
  }
  const token = envString("AGENTBOX_API_TOKEN", "");
  return {
    domain,
    smtpHost: envString("AGENTBOX_SMTP_HOST", "127.0.0.1"),
    smtpPort: envPort("AGENTBOX_SMTP_PORT", 2525),
    smtpEnabled: envBool("AGENTBOX_SMTP_ENABLED", true),
    httpHost: envString("AGENTBOX_HTTP_HOST", "127.0.0.1"),
    httpPort: envPort("AGENTBOX_HTTP_PORT", 8791),
    httpEnabled: envBool("AGENTBOX_HTTP_ENABLED", true),
    dataDir: envString("AGENTBOX_DATA_DIR", "./data"),
    persist: envBool("AGENTBOX_PERSIST", true),
    autoCreate: envBool("AGENTBOX_AUTO_CREATE", false),
    inboxTtlSeconds: envInt("AGENTBOX_INBOX_TTL_SECONDS", 3600, 0, 60 * 60 * 24 * 30),
    apiToken: token === "" ? null : token,
    allowOpenHttp: envBool("AGENTBOX_ALLOW_OPEN_HTTP", false),
    maxMessagesPerInbox: 200,
    maxBodyChars: 100_000,
  };
}

function takeValue(flag: string, value: string | undefined): string {
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

export function parseCli(argv: string[]): ParsedCli {
  const config = configFromEnv();
  const [command = "", ...rest] = argv;
  for (let i = 0; i < rest.length; i += 1) {
    const flag = rest[i];
    switch (flag) {
      case "--domain":
        config.domain = takeValue(flag, rest[i + 1]).toLowerCase();
        if (!isValidDomain(config.domain)) throw new Error(`Invalid domain "${config.domain}"`);
        i += 1;
        break;
      case "--smtp-host":
        config.smtpHost = takeValue(flag, rest[i + 1]);
        i += 1;
        break;
      case "--smtp-port":
        config.smtpPort = parsePort(takeValue(flag, rest[i + 1]), flag);
        i += 1;
        break;
      case "--http-host":
        config.httpHost = takeValue(flag, rest[i + 1]);
        i += 1;
        break;
      case "--http-port":
        config.httpPort = parsePort(takeValue(flag, rest[i + 1]), flag);
        i += 1;
        break;
      case "--data-dir":
        config.dataDir = takeValue(flag, rest[i + 1]);
        i += 1;
        break;
      case "--ttl-seconds":
        config.inboxTtlSeconds = Number(takeValue(flag, rest[i + 1]));
        if (!Number.isInteger(config.inboxTtlSeconds) || config.inboxTtlSeconds < 0) {
          throw new Error("--ttl-seconds must be an integer >= 0");
        }
        i += 1;
        break;
      case "--auto-create":
        config.autoCreate = true;
        break;
      case "--no-persist":
        config.persist = false;
        break;
      case "--no-http":
        config.httpEnabled = false;
        break;
      case "--no-smtp":
        config.smtpEnabled = false;
        break;
      default:
        throw new Error(`Unknown argument "${flag}"`);
    }
  }
  return { command, config };
}

export function isLoopbackHost(host: string): boolean {
  const normalized = host.replace(/^\[|\]$/g, "").toLowerCase();
  return normalized === "127.0.0.1" || normalized === "localhost" || normalized === "::1";
}

export function helpText(): string {
  return `Agentbox — ephemeral inboxes for UI email tests

Usage:
  agentbox mcp     Start the MCP server on stdio, plus SMTP and the local HTTP API
  agentbox serve   Start SMTP and the local HTTP API without MCP

Options:
  --domain <domain>         Catch-all domain (default temp.local)
  --smtp-host <host>        SMTP bind host (default 127.0.0.1)
  --smtp-port <port>        SMTP bind port (default 2525)
  --http-host <host>        HTTP bind host (default 127.0.0.1)
  --http-port <port>        HTTP bind port (default 8791)
  --data-dir <path>         JSON store directory (default ./data)
  --ttl-seconds <n>         Default inbox lifetime, 0 disables expiry
  --auto-create             Create an inbox the first time mail arrives
  --no-persist              Keep mail in memory only
  --no-http                 Do not start the HTTP API
  --no-smtp                 Do not start SMTP

stdout is the MCP protocol channel. Logs go to stderr.
`;
}
