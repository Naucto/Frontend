export class SpriteSheetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpriteSheetError";
  }
}
