export class MapProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MapProviderError";
  }
}
