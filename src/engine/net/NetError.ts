export class NetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NetError";
  }
}

export class NetConflictError extends NetError {
  constructor(public readonly path: string) {
    super(`net: conflict on '${path}'`);
    this.name = "NetConflictError";
  }
}
