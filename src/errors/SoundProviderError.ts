export class SoundProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SoundProviderError";
  }
}

