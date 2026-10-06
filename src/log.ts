function write(level: string, message: string, extra?: unknown): void {
  if (extra === undefined) {
    console.error(`[open-agentmail] ${level} ${message}`);
    return;
  }
  console.error(`[open-agentmail] ${level} ${message}`, extra);
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
