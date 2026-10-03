import {
  ACTION_BIT,
  type ActionBindings,
  ACTIONS,
  DEFAULT_BINDINGS,
  MAX_PLAYERS,
} from './ActionMap';
import type { InputSource } from './InputSource';
import type { InputState } from './InputState';

const DEADZONE = 0.3;

/** Polls navigator.getGamepads() every step; pad i drives player i (pad 0 merges with the keyboard as player 1). */
export class GamepadSource implements InputSource {
  private bindings: ActionBindings;
  private readonly getGamepads: () => (Gamepad | null)[];
  /** Player slot per gamepad index; -1 = unassigned. */
  readonly slots: number[] = [];
  private readonly masks = new Uint16Array(MAX_PLAYERS);

  constructor(opts: { bindings?: ActionBindings; getGamepads?: () => (Gamepad | null)[] } = {}) {
    this.bindings = opts.bindings ?? DEFAULT_BINDINGS;
    this.getGamepads =
      opts.getGamepads ?? (() => (typeof navigator === 'undefined' ? [] : navigator.getGamepads()));
  }

  setBindings(b: ActionBindings): void {
    this.bindings = b;
  }

  attach(): void {
    /* polled; nothing to attach */
  }
  detach(): void {
    /* nothing */
  }

  assign(gamepadIndex: number, player: number): void {
    this.slots[gamepadIndex] = player;
  }

  poll(state: InputState): void {
    const pads = this.getGamepads();
    let connected = 1;
    this.masks.fill(0);
    for (let i = 0; i < pads.length; i++) {
      const pad = pads[i];
      if (!pad) continue;
      const player = this.slots[i] ?? i;
      if (player >= MAX_PLAYERS) continue;
      connected = Math.max(connected, player + 1);
      this.masks[player] = (this.masks[player] ?? 0) | this.readMask(pad);
    }
    // Every player is written, so a pad that was unplugged lets go of its bits.
    for (let p = 0; p < MAX_PLAYERS; p++) state.setPolled(p, this.masks[p] ?? 0);
    state.connectedPlayers = connected;
  }

  private readMask(pad: Gamepad): number {
    let mask = 0;
    for (const action of ACTIONS) {
      for (const ref of this.bindings.gamepad[action]) {
        if (ref.button !== undefined && pad.buttons[ref.button]?.pressed)
          mask |= ACTION_BIT[action];
        if (ref.axis !== undefined) {
          const v = pad.axes[ref.axis] ?? 0;
          if ((ref.direction ?? 1) > 0 ? v > DEADZONE : v < -DEADZONE) mask |= ACTION_BIT[action];
        }
      }
    }
    return mask;
  }
}
