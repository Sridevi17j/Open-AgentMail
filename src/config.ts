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

function lookupEnv(suffix: string, env: NodeJS.ProcessEnv): { name: string; value: string | undefined } {
  const name = `OPEN_AGENTMAIL_${suffix}`;
  const current = env[name];
  if (current !== undefined && current.trim() !== "") return { name, value: current };
  const legacy = `AGENTBOX_${suffix}`;
  const previous = env[legacy];
  if (previous !== undefined && previous.trim() !== "") return { name: legacy, value: previous };
  return { name, value: undefined };
}

function envString(suffix: string, fallback: string, env: NodeJS.ProcessEnv): string {
  const value = lookupEnv(suffix, env).value;
  if (value === undefined || value.trim() === "") return fallback;
  return value.trim();
}

function envBool(suffix: string, fallback: boolean, env: NodeJS.ProcessEnv): boolean {
  const found = lookupEnv(suffix, env);
  if (found.value === undefined || found.value.trim() === "") return fallback;
  const normalized = found.value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  throw new Error(`${found.name} must be true or false`);
}

function parsePort(raw: string, label: string): number {
  if (!/^\d+$/.test(raw)) throw new Error(`${label} must be an integer port`);
  const port = Number(raw);
  if (port < 0 || port > 65535) throw new Error(`${label} must be between 0 and 65535`);
  return port;
}

function envPort(suffix: string, fallback: number, env: NodeJS.ProcessEnv): number {
  const found = lookupEnv(suffix, env);
  if (found.value === undefined || found.value.trim() === "") return fallback;
  return parsePort(found.value.trim(), found.name);
}

function envInt(suffix: string, fallback: number, min: number, max: number, env: NodeJS.ProcessEnv): number {
  const found = lookupEnv(suffix, env);
  if (found.value === undefined || found.value.trim() === "") return fallback;
  if (!/^\d+$/.test(found.value.trim())) throw new Error(`${found.name} must be an integer`);
  const parsed = Number(found.value.trim());
  if (parsed < min || parsed > max) throw new Error(`${found.name} must be between ${min} and ${max}`);
  return parsed;
}

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): Config {
  const domainEnv = lookupEnv("DOMAIN", env);
  const domain = (domainEnv.value?.trim() || "temp.local").toLowerCase();
  if (!isValidDomain(domain)) {
    throw new Error(`${domainEnv.name} "${domain}" is not a valid domain`);
  }
  const token = envString("API_TOKEN", "", env);
  return {
    domain,
    smtpHost: envString("SMTP_HOST", "127.0.0.1", env),
    smtpPort: envPort("SMTP_PORT", 2525, env),
    smtpEnabled: envBool("SMTP_ENABLED", true, env),
    httpHost: envString("HTTP_HOST", "127.0.0.1", env),
    httpPort: envPort("HTTP_PORT", 8791, env),
    httpEnabled: envBool("HTTP_ENABLED", true, env),
    dataDir: envString("DATA_DIR", "./data", env),
    persist: envBool("PERSIST", true, env),
    autoCreate: envBool("AUTO_CREATE", false, env),
    inboxTtlSeconds: envInt("INBOX_TTL_SECONDS", 3600, 0, 60 * 60 * 24 * 30, env),
    apiToken: token === "" ? null : token,
    allowOpenHttp: envBool("ALLOW_OPEN_HTTP", false, env),
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
  return `Open-AgentMail — ephemeral inboxes for UI email tests

Usage:
  open-agentmail mcp     Start the MCP server on stdio, plus SMTP and the local HTTP API
  open-agentmail serve   Start SMTP and the local HTTP API without MCP

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
