import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import {
  type ActionInput,
  canonicalKey,
  GAMEPAD_DEADZONE,
  isPadControlDown,
  PAD_CONTROLS,
} from '@naucto/engine';

/** How often the gamepad is read: the Gamepad API has no events for buttons or axes. */
const POLL_MS = 120;

/**
 * How far a stick must lean for a capture to take it. A capture takes the first control held, so
 * it sits well beyond the deadzone a game reads at: a stick resting off-centre is not a push.
 */
const CAPTURE_AXIS_THRESHOLD = GAMEPAD_DEADZONE * 2;

/**
 * Listens for the next keyboard key or gamepad control, whichever comes first, and answers it as
 * an input an action can be plugged with. A key is answered for the first player: the keyboard does
 * not say whose it is. Provided per component, since it listens only while its page is open.
 */
@Injectable()
export class BindingCaptureService {
  readonly listening = signal(false);
  private settle: ((input: ActionInput | null) => void) | null = null;
  private poll: ReturnType<typeof setInterval> | undefined;

  constructor() {
    const onKey = (event: KeyboardEvent): void => {
      if (!this.settle) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      // Escape is how you back out of a capture, so it can never be what a capture takes.
      this.finish(
        event.key === 'Escape' ? null : { kind: 'key', player: 0, key: canonicalKey(event.key) },
      );
    };
    window.addEventListener('keydown', onKey, true);
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('keydown', onKey, true);
      this.finish(null);
    });
  }

  private finish(input: ActionInput | null): void {
    clearInterval(this.poll);
    this.poll = undefined;
    this.listening.set(false);
    const settle = this.settle;
    this.settle = null;
    settle?.(input);
  }

  /** Backs out of the capture in progress, which answers null. */
  cancel(): void {
    this.finish(null);
  }

  /** The next input, or null when the capture is backed out of; a second call ends the first. */
  listen(): Promise<ActionInput | null> {
    this.finish(null);
    this.listening.set(true);
    this.poll = setInterval(() => {
      const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
      for (const pad of pads) {
        const control =
          pad && PAD_CONTROLS.find((name) => isPadControlDown(pad, name, CAPTURE_AXIS_THRESHOLD));
        if (control) {
          this.finish({ kind: 'pad', control });
          return;
        }
      }
    }, POLL_MS);

    return new Promise((resolve) => {
      this.settle = resolve;
    });
  }
}
