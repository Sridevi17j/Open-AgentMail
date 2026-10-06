import type { Server } from "node:http";

import { Actions } from "./actions.js";
import type { Config } from "./config.js";
import { isLoopbackHost } from "./config.js";
import { createHttpServer, listenHttp, type HttpApp } from "./http.js";
import { log } from "./log.js";
import { SmtpReceiver } from "./smtp.js";
import { Store } from "./store.js";

export class OpenAgentMail {
  readonly config: Config;
  readonly store: Store;
  readonly actions: Actions;
  smtpPort = 0;
  httpPort = 0;

  private smtp: SmtpReceiver | null = null;
  private http: Server | null = null;
  private sweepTimer: NodeJS.Timeout | null = null;

  constructor(config: Config) {
    this.config = config;
    this.store = new Store({
      domain: config.domain,
      dataDir: config.dataDir,
      persist: config.persist,
      defaultTtlSeconds: config.inboxTtlSeconds,
      maxMessagesPerInbox: config.maxMessagesPerInbox,
      maxBodyChars: config.maxBodyChars,
    });
    this.actions = new Actions(this.store);
  }

  async start(): Promise<void> {
    this.assertHttpSafety();
    await this.store.load();
    if (this.config.smtpEnabled) {
      this.smtp = new SmtpReceiver(this.store, this.config);
      this.smtpPort = await this.smtp.listen();
    }
    if (this.config.httpEnabled) {
      const httpApp: HttpApp = {
        actions: this.actions,
        config: this.config,
        smtpPort: () => this.smtpPort,
        httpPort: () => this.httpPort,
      };
      this.http = createHttpServer(httpApp);
      this.httpPort = await listenHttp(this.http, this.config.httpPort, this.config.httpHost);
    }
    this.sweepTimer = setInterval(() => {
      void this.store.sweep().catch((error: unknown) => {
        log.error("inbox sweep failed", error instanceof Error ? error.message : error);
      });
    }, 60_000);
    this.sweepTimer.unref();
    if (this.config.domain.endsWith(".local") && this.config.smtpEnabled && !isLoopbackHost(this.config.smtpHost)) {
      log.warn(`${this.config.domain} is not routable on the public internet. Use a domain you control for a real MX.`);
    }
  }

  async stop(): Promise<void> {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    this.sweepTimer = null;
    if (this.http) {
      const http = this.http;
      this.http = null;
      await new Promise<void>((resolve, reject) => {
        http.close((error) => (error ? reject(error) : resolve()));
      });
    }
    if (this.smtp) {
      const smtp = this.smtp;
      this.smtp = null;
      await smtp.close();
    }
  }

  private assertHttpSafety(): void {
    if (!this.config.httpEnabled || isLoopbackHost(this.config.httpHost)) return;
    if (this.config.apiToken) return;
    if (this.config.allowOpenHttp) {
      log.warn("HTTP is not bound to localhost and no API token is set");
      return;
    }
    throw new Error(
      "Refusing to bind HTTP beyond localhost without OPEN_AGENTMAIL_API_TOKEN. OTP mail would be readable by anyone who can reach the port.",
    );
  }
}
