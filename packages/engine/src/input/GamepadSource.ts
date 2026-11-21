import { MAX_PLAYERS, type PadControl } from './actions';
import type { InputSource } from './InputSource';
import type { InputState } from './InputState';

/** How far an axis has to lean, out of 1, before the game reads it as a direction pressed. */
export const GAMEPAD_DEADZONE = 0.3;

/** Where the Gamepad API's standard mapping puts each control. */
const STANDARD_MAPPING: Record<
  PadControl,
  { button: number } | { axis: number; direction: 1 | -1 }
> = {
  'dpad-up': { button: 12 },
  'dpad-down': { button: 13 },
  'dpad-left': { button: 14 },
  'dpad-right': { button: 15 },
  'stick-up': { axis: 1, direction: -1 },
  'stick-down': { axis: 1, direction: 1 },
  'stick-left': { axis: 0, direction: -1 },
  'stick-right': { axis: 0, direction: 1 },
  a: { button: 0 },
  b: { button: 1 },
  x: { button: 2 },
  y: { button: 3 },
  lb: { button: 4 },
  rb: { button: 5 },
  select: { button: 8 },
  start: { button: 9 },
};

/** Whether a pad holds a control: its button pressed, or its stick leaning past `deadzone`. */
export function isPadControlDown(
  pad: Gamepad,
  control: PadControl,
  deadzone = GAMEPAD_DEADZONE,
): boolean {
  const at = STANDARD_MAPPING[control];
  if ('button' in at) {
    return pad.buttons[at.button]?.pressed === true;
  }

  return (pad.axes[at.axis] ?? 0) * at.direction > deadzone;
}

/**
 * Polls navigator.getGamepads() every step; pad i drives player i (pad 0 merges with the keyboard
 * as player 1). Every pad presses the actions the running game plugs its controls into.
 */
export class GamepadSource implements InputSource {
  private readonly getGamepads: () => (Gamepad | null)[];
  /** Player slot per gamepad index; -1 = unassigned. */
  readonly slots: number[] = [];
  private readonly masks = new Uint32Array(MAX_PLAYERS);

  constructor(opts: { getGamepads?: () => (Gamepad | null)[] } = {}) {
    this.getGamepads =
      opts.getGamepads ?? (() => (typeof navigator === 'undefined' ? [] : navigator.getGamepads()));
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
      if (!pad) {
        continue;
      }
      const player = this.slots[i] ?? i;
      if (player >= MAX_PLAYERS) {
        continue;
      }
      connected = Math.max(connected, player + 1);
      for (const [control, mask] of state.actions.pad) {
        if (isPadControlDown(pad, control)) {
          this.masks[player] = (this.masks[player] ?? 0) | mask;
        }
      }
    }
    // Every player is written, so a pad that was unplugged lets go of its bits.
    for (let player = 0; player < MAX_PLAYERS; player++) {
      state.setPolled(player, this.masks[player] ?? 0);
    }
    state.connectedPlayers = connected;
  }
}
