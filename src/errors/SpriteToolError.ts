export class SpriteToolError extends Error {
  readonly data?: unknown;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}
