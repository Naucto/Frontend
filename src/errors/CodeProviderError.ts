export class CodeProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CodeProviderError";
  }
}
