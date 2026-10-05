import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { ZodType } from "zod";

import type { Actions } from "./actions.js";
import { createInboxResult } from "./actions.js";
import type { Config } from "./config.js";
import { debugPage } from "./debug-page.js";
import { AgentboxError } from "./errors.js";
import { log } from "./log.js";
import {
  createInboxInput,
  injectMessageInput,
  listMessagesInput,
  waitInput,
} from "./schemas.js";
import { VERSION } from "./version.js";

export interface HttpApp {
  actions: Actions;
  config: Config;
  smtpPort: () => number;
  httpPort: () => number;
}

function send(res: ServerResponse, status: number, body: unknown, type = "application/json; charset=utf-8"): void {
  const payload = type.startsWith("application/json") ? JSON.stringify(body) : String(body);
  res.writeHead(status, {
    "content-type": type,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  res.end(payload);
}

function authorize(req: IncomingMessage, token: string | null): void {
  if (!token) return;
  const header = req.headers.authorization ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match || match[1] !== token) throw new AgentboxError("Unauthorized", 401);
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 1_000_000) throw new AgentboxError("Request body is too large", 413);
    chunks.push(buffer);
  }
  if (size === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new AgentboxError("Request body must be JSON");
  }
}

function asRecord(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) return body as Record<string, unknown>;
  throw new AgentboxError("Request body must be a JSON object");
}

function parseBody<T>(schema: ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    const message = result.error.issues
      .map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`)
      .join("; ");
    throw new AgentboxError(message);
  }
  return result.data;
}

function requestSignal(req: IncomingMessage, res: ServerResponse): AbortSignal {
  const controller = new AbortController();
  req.on("close", () => {
    if (!res.writableEnded) controller.abort();
  });
  return AbortSignal.any([controller.signal, AbortSignal.timeout(200_000)]);
}

export function createHttpServer(app: HttpApp): Server {
  return createServer((req, res) => {
    void handle(app, req, res);
  });
}

async function handle(app: HttpApp, req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const path = url.pathname;
    const method = req.method ?? "GET";
    const parts = path.split("/").filter(Boolean);

    if (method === "GET" && path === "/health") {
      send(res, 200, healthBody(app));
      return;
    }
    if (method === "GET" && path === "/") {
      send(res, 200, debugPage(), "text/html; charset=utf-8");
      return;
    }

    authorize(req, app.config.apiToken);

    if (parts[0] !== "api" || parts[1] !== "inboxes") {
      send(res, 404, { error: "Not found" });
      return;
    }

    if (parts.length === 2 && method === "GET") {
      send(res, 200, { inboxes: app.actions.listInboxes() });
      return;
    }
    if (parts.length === 2 && method === "POST") {
      const body = parseBody(createInboxInput, await readJson(req));
      const inbox = await app.actions.createInbox({
        localPart: body.local_part,
        ttlSeconds: body.ttl_seconds,
        withPassword: body.with_password,
      });
      send(res, 201, { ...createInboxResult(inbox), created_at: inbox.createdAt });
      return;
    }

    const inboxId = parts[2];
    if (!inboxId) {
      send(res, 404, { error: "Not found" });
      return;
    }

    if (parts.length === 3 && method === "GET") {
      const inbox = app.actions.resolveInbox({ inbox_id: inboxId });
      send(res, 200, {
        address: inbox.address,
        password: inbox.password,
        inbox_id: inbox.id,
        expires_at: inbox.expiresAt,
        created_at: inbox.createdAt,
      });
      return;
    }
    if (parts.length === 3 && method === "DELETE") {
      send(res, 200, await app.actions.deleteInbox({ inbox_id: inboxId }));
      return;
    }
    if (parts.length === 4 && parts[3] === "messages" && method === "GET") {
      send(res, 200, app.actions.listMessages(parseBody(listMessagesInput, { inbox_id: inboxId })));
      return;
    }
    if (parts.length === 5 && parts[3] === "messages" && method === "GET") {
      send(res, 200, app.actions.getMessage({ inbox_id: inboxId }, parts[4] ?? ""));
      return;
    }
    if (parts.length === 4 && parts[3] === "inject" && method === "POST") {
      const body = parseBody(injectMessageInput, { ...asRecord(await readJson(req)), inbox_id: inboxId });
      send(res, 201, await app.actions.injectMessage(body));
      return;
    }
    if (parts.length === 4 && (parts[3] === "wait-otp" || parts[3] === "wait-link") && method === "POST") {
      const body = parseBody(waitInput, { ...asRecord(await readJson(req)), inbox_id: inboxId });
      const signal = requestSignal(req, res);
      const result =
        parts[3] === "wait-otp"
          ? await app.actions.waitForOtp(body, { signal })
          : await app.actions.waitForLink(body, { signal });
      send(res, 200, result);
      return;
    }

    send(res, 404, { error: "Not found" });
  } catch (error) {
    if (res.writableEnded) return;
    if (error instanceof AgentboxError) {
      send(res, error.status, { error: error.message });
      return;
    }
    log.error("http request failed", error instanceof Error ? error.message : error);
    send(res, 500, { error: "Internal error" });
  }
}

function healthBody(app: HttpApp) {
  return {
    ok: true,
    name: "agentbox",
    version: VERSION,
    domain: app.config.domain,
    smtp: { enabled: app.config.smtpEnabled, host: app.config.smtpHost, port: app.smtpPort() },
    http: { host: app.config.httpHost, port: app.httpPort() },
    persist: app.config.persist,
    autoCreate: app.config.autoCreate,
    inboxTtlSeconds: app.config.inboxTtlSeconds,
  };
}

export function listenHttp(server: Server, port: number, host: string): Promise<number> {
  server.requestTimeout = 240_000;
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      const address = server.address();
      resolve(address && typeof address === "object" ? address.port : port);
    });
  });
}
