import net from "node:net";

export class SmtpDialogError extends Error {
  readonly code: number;

  constructor(message: string, code: number) {
    super(message);
    this.name = "SmtpDialogError";
    this.code = code;
  }
}

export interface OutboundMail {
  host?: string;
  port: number;
  from: string;
  to: string;
  subject: string;
  text: string;
}

function headerSafe(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function dotStuff(body: string): string {
  return body
    .replace(/\r?\n/g, "\r\n")
    .split("\r\n")
    .map((line) => (line.startsWith(".") ? `.${line}` : line))
    .join("\r\n");
}

export function sendSmtpMessage(mail: OutboundMail): Promise<void> {
  const from = headerSafe(mail.from);
  const to = headerSafe(mail.to);
  const subject = headerSafe(mail.subject);
  const payload = dotStuff(
    [
      `From: ${from}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      `Date: ${new Date().toUTCString()}`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=utf-8",
      "",
      mail.text,
    ].join("\r\n"),
  );

  const steps = [
    { code: 220, send: "EHLO open-agentmail.local\r\n" },
    { code: 250, send: `MAIL FROM:<${from}>\r\n` },
    { code: 250, send: `RCPT TO:<${to}>\r\n` },
    { code: 250, send: "DATA\r\n" },
    { code: 354, send: `${payload}\r\n.\r\n` },
    { code: 250, send: "QUIT\r\n" },
  ];

  return new Promise((resolve, reject) => {
    const socket = net.connect(mail.port, mail.host ?? "127.0.0.1");
    let buffer = "";
    let step = 0;
    let settled = false;

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(error);
    };

    const finish = () => {
      if (settled) return;
      settled = true;
      socket.end();
      resolve();
    };

    socket.setTimeout(8_000, () => fail(new SmtpDialogError("SMTP conversation timed out", 0)));
    socket.on("error", (error) => fail(error));

    const consume = () => {
      for (;;) {
        const lineEnd = buffer.indexOf("\r\n");
        if (lineEnd < 0) return;
        const line = buffer.slice(0, lineEnd);
        buffer = buffer.slice(lineEnd + 2);
        if (!/^\d{3}[ -]/.test(line)) continue;
        if (line[3] === "-") continue;
        const code = Number(line.slice(0, 3));
        const expected = steps[step];
        if (!expected) {
          finish();
          return;
        }
        if (code !== expected.code) {
          fail(new SmtpDialogError(line, code));
          return;
        }
        socket.write(expected.send);
        step += 1;
        if (step >= steps.length) {
          // Wait for the QUIT response, which is consumed on the next pass.
        }
      }
    };

    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      try {
        consume();
      } catch (error) {
        fail(error instanceof Error ? error : new Error(String(error)));
      }
    });
    socket.on("close", () => {
      if (!settled && step >= steps.length) finish();
    });
  });
}
