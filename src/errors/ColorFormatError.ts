export class ColorFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ColorFormatError";
  }
}

