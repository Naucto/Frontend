import type { InputState } from './InputState';

/**
 * A device feeding an InputState: keyboard, gamepad, on-screen pad.
 *
 * `target` is the element the engine offers (normally the canvas). A source that owns its own
 * element — the touch pad lives in its own zone below the screen — ignores it and binds to that
 * instead, which is why the parameter is nullable.
 */
export interface InputSource {
  attach(target: HTMLElement | null, state: InputState): void;
  detach(): void;
  /** Called once per fixed step before the state is committed (for polled devices). */
  poll?(state: InputState): void;
}
