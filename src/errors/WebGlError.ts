class WebGlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebGlError";
  }
}

export default WebGlError;
