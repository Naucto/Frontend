export type EnginePhase = 'load' | 'init' | 'update' | 'draw' | 'callback';

export interface EngineError {
  phase: EnginePhase;
  message: string;
  file?: string;
  line?: number;
  traceback?: string;
  /** 'budget' when the instruction guard fired. */
  kind: 'runtime' | 'syntax' | 'budget';
}
