export class SpriteToolError extends Error {
  readonly code: string;
  readonly data?: unknown;

  constructor(message: string, code = "SPRITE_TOOL_ERROR", data?: unknown) {
    super(message);
    this.name = "SpriteToolError";
    this.code = code;
    this.data = data;
  }
}
