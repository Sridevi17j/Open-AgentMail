function write(level: string, message: string, extra?: unknown): void {
  if (extra === undefined) {
    console.error(`[agentbox] ${level} ${message}`);
    return;
  }
  console.error(`[agentbox] ${level} ${message}`, extra);
}

export const log = {
  info(message: string, extra?: unknown): void {
    write("info", message, extra);
  },
  warn(message: string, extra?: unknown): void {
    write("warn", message, extra);
  },
  error(message: string, extra?: unknown): void {
    write("error", message, extra);
  },
};
