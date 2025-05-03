export class CanvasError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CanvasError";
  }
}
export class CanvasNotInitializedError extends CanvasError {
  constructor() {
    super("Canvas not initialized");
  }
}
