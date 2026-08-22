import { ApiContext } from "./ApiContext";

export abstract class EngineModule {
  protected constructor(protected readonly ctx: ApiContext) {}

  // Release any resources the module owns (sessions, listeners, …). The manager
  // calls this when the engine is torn down; stateless modules inherit the no-op.
  destroy(): void {}
}
