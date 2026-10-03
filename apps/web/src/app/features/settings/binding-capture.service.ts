import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { type Action, GAMEPAD_DEADZONE } from '@naucto/engine';

import { InputBindingsStore } from '../../core/input/input-bindings.store';

/** What is being captured: a keyboard key or a gamepad button, for one action. */
export interface Capture {
  action: Action;
  device: 'keyboard' | 'gamepad';
  /** The key being replaced, when rebinding an existing one rather than adding. */
  replacing?: string;
}

/** How often the gamepad is read: the Gamepad API has no events for buttons or axes. */
const POLL_MS = 120;

/**
 * How far a stick must lean for a capture to take it. A capture binds the first axis past this, so
 * it sits well beyond the deadzone a game reads at: a stick resting off-centre is not a push.
 */
const CAPTURE_AXIS_THRESHOLD = GAMEPAD_DEADZONE * 2;

/** `a` and `A` are one binding; the map stores both so a shifted key still matches. */
export function canonicalKey(key: string): string {
  return key.length === 1 ? key.toLowerCase() : key;
}

/**
 * Waits for the next key or gamepad input and binds it to the action being captured. Provided per
 * component: it listens for as long as the page that captures is open.
 */
@Injectable()
export class BindingCaptureService {
  private readonly bindings = inject(InputBindingsStore);
  /** The player slot a keyboard capture binds for; the gamepad map has no slots. */
  readonly player = signal(0);
  readonly capturing = signal<Capture | null>(null);
  /** The first connected gamepad, if any. */
  readonly pad = signal<{ id: string } | null>(null);

  constructor() {
    const onKey = (event: KeyboardEvent): void => {
      const active = this.capturing();
      if (!active) {
        return;
      }
      // Escape is how you back out of a capture, so it can never be what a capture binds.
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        this.capturing.set(null);
        return;
      }
      if (active.device !== 'keyboard') {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      this.capturing.set(null);
      const variants =
        event.key.length === 1 ? [event.key.toLowerCase(), event.key.toUpperCase()] : [event.key];
      const current = this.bindings.bindings().keyboard[this.player()]?.[active.action] ?? [];
      const kept = active.replacing
        ? current.filter((key) => canonicalKey(key) !== active.replacing)
        : current;
      this.bindings.setKeys(this.player(), active.action, [...new Set([...kept, ...variants])]);
    };
    window.addEventListener('keydown', onKey, true);

    const poll = setInterval(() => {
      const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
      const first = pads.find((gamepad) => gamepad !== null) ?? null;
      this.pad.set(first ? { id: first.id } : null);
      const active = this.capturing();
      if (!first || active?.device !== 'gamepad') {
        return;
      }
      const pressed = first.buttons.findIndex((button) => button.pressed);
      if (pressed >= 0) {
        this.capturing.set(null);
        this.bindings.setGamepad(active.action, [{ button: pressed }]);
        return;
      }
      const axis = first.axes.findIndex((value) => Math.abs(value) > CAPTURE_AXIS_THRESHOLD);
      if (axis >= 0) {
        this.capturing.set(null);
        this.bindings.setGamepad(active.action, [
          { axis, direction: (first.axes[axis] ?? 0) < 0 ? -1 : 1 },
        ]);
      }
    }, POLL_MS);

    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('keydown', onKey, true);
      clearInterval(poll);
    });
  }
}
