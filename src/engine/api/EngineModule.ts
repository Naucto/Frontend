import { ApiContext } from "./ApiContext";

export abstract class EngineModule {
  protected constructor(protected readonly ctx: ApiContext) {}
}
