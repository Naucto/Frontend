export class NetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetError';
  }
}
