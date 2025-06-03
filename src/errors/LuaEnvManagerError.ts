export class LuaEnvManagerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LuaEnvManagerError";
  }
}
