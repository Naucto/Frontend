export class ContextError extends Error {
  constructor(hook: string, provider: string) {
    super(`${hook} must be used within a ${provider}`);
    this.name = "ContextError";
  }
}
