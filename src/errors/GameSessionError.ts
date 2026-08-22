export class GameSessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GameSessionError";
  }
}
