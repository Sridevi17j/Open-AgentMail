export class AgentboxError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "AgentboxError";
    this.status = status;
  }
}
