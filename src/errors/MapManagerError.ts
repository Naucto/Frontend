export class MapManagerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MapManagerError";
  }
}
