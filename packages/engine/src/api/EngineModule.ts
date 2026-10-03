import type { ApiContext } from './ApiContext';

export abstract class EngineModule {
  protected constructor(protected readonly ctx: ApiContext) {}

  /** Releases what the module owns when the run it served ends. */
  destroy(): void {}
}
