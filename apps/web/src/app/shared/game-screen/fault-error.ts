import type { EngineFault } from '@naucto/engine';

/**
 * A fault as the error the crash reporter sends. Its stack is the fault's own, empty when the
 * fault has none, never the frames of the code that turned it into an error.
 */
export function faultError(fault: EngineFault): Error {
  return Object.assign(new Error(fault.message), fault, { stack: fault.stack ?? '' });
}
