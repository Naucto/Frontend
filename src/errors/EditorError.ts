
export class EditorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EditorError";
  }
}
