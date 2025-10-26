export class SpriteProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpriteProviderError";
  }
}
