import type { EnginePhase } from './EngineError';

/**
 * A failure of the engine itself, as opposed to an error of the game it runs:
 *
 * - `internal`: a JS bug escaped a host call; the game sees it as a Lua error and halts.
 * - `webgl-context-lost`: the browser took the GPU context away.
 * - `audio`: the synth could not start or its worklet crashed.
 */
export interface EngineFault {
  kind: 'internal' | 'webgl-context-lost' | 'audio';
  name: string;
  message: string;
  stack?: string;
  phase?: EnginePhase;
}

/**
 * The errors no host function throws on purpose: every deliberate refusal is a plain `Error`, so
 * one of these is a bug. A JS stack overflow is the game's own runaway recursion, not one.
 */
export function isHostBug(error: unknown): error is Error {
  return (
    error instanceof TypeError ||
    error instanceof ReferenceError ||
    (error instanceof RangeError && !/call stack/i.test(error.message))
  );
}

export function faultOf(kind: EngineFault['kind'], error: unknown): EngineFault {
  if (error instanceof Error) {
    return {
      kind,
      name: error.name,
      message: error.message,
      ...(error.stack === undefined ? {} : { stack: error.stack }),
    };
  }
  return { kind, name: 'Error', message: String(error) };
}

export type FaultListener = (fault: EngineFault) => void;
