import { MAX_PLAYERS } from './actions';
import { type ActionTable, NO_ACTIONS } from './ActionTable';

/**
 * Snapshot of all inputs for one fixed step. Sources write into `next`; the
 * engine calls `commit()` at the top of every step so the game sees a stable
 * frame and pressed/released edges are per step, not per event.
 *
 * An action is one bit of a player's mask, at the place the game's {@link ActionTable} gives it.
 *
 * Buttons come in on two lanes that only meet at `commit()`: event sources (keyboard, touch)
 * flip bits as they happen, and polled sources (gamepad) rewrite their whole mask every step.
 * Kept apart, a pad's poll cannot erase a key that is still down, and a key's release cannot
 * clear a pad's bit.
 */
export class InputState {
  readonly buttons = new Uint32Array(MAX_PLAYERS);
  readonly prevButtons = new Uint32Array(MAX_PLAYERS);
  private readonly nextButtons = new Uint32Array(MAX_PLAYERS);
  private readonly polledButtons = new Uint32Array(MAX_PLAYERS);
  private table: ActionTable = NO_ACTIONS;

  readonly keys = new Set<string>();
  readonly prevKeys = new Set<string>();
  private readonly nextKeys = new Set<string>();

  mouseX: number | null = null;
  mouseY: number | null = null;
  mouseButtons = 0;
  prevMouseButtons = 0;
  private nextMouseX: number | null = null;
  private nextMouseY: number | null = null;
  private nextMouseButtons = 0;

  connectedPlayers = 1;

  /** The running game's actions, which the sources read to turn a key or a control into bits. */
  get actions(): ActionTable {
    return this.table;
  }

  /** Whatever is held is let go, since a bit no longer stands for the action it did. */
  setActions(table: ActionTable): void {
    this.table = table;
    this.buttons.fill(0);
    this.prevButtons.fill(0);
    this.nextButtons.fill(0);
    this.polledButtons.fill(0);
  }

  /**
   * Forgets what is held so a new run sees fresh press edges; `connectedPlayers` counts plugged
   * pads and is kept.
   */
  reset(): void {
    this.buttons.fill(0);
    this.prevButtons.fill(0);
    this.nextButtons.fill(0);
    this.polledButtons.fill(0);
    this.keys.clear();
    this.prevKeys.clear();
    this.nextKeys.clear();
    this.mouseX = null;
    this.mouseY = null;
    this.mouseButtons = 0;
    this.prevMouseButtons = 0;
    this.nextMouseX = null;
    this.nextMouseY = null;
    this.nextMouseButtons = 0;
  }

  // ---- written by sources ---------------------------------------------------

  setKey(key: string, down: boolean): void {
    if (down) {
      this.nextKeys.add(key);
    } else {
      this.nextKeys.delete(key);
    }
  }

  clearKeys(): void {
    this.nextKeys.clear();
  }

  /** Sets or lifts the bits of `mask` for an event source: a key going down, a thumb leaving. */
  press(player: number, mask: number, down: boolean): void {
    if (player < 0 || player >= MAX_PLAYERS) {
      return;
    }
    if (down) {
      this.nextButtons[player] = (this.nextButtons[player] ?? 0) | mask;
    } else {
      this.nextButtons[player] = (this.nextButtons[player] ?? 0) & ~mask;
    }
  }

  clearActions(player: number): void {
    if (player >= 0 && player < MAX_PLAYERS) {
      this.nextButtons[player] = 0;
    }
  }

  /** Replace a polled source's whole mask for a player; it holds until the next poll. */
  setPolled(player: number, mask: number): void {
    if (player >= 0 && player < MAX_PLAYERS) {
      this.polledButtons[player] = mask;
    }
  }

  setMouse(x: number | null, y: number | null, buttons: number): void {
    this.nextMouseX = x;
    this.nextMouseY = y;
    this.nextMouseButtons = buttons;
  }

  // ---- engine ---------------------------------------------------------------

  /** Promote pending inputs to the current step. */
  commit(): void {
    this.prevButtons.set(this.buttons);
    for (let player = 0; player < MAX_PLAYERS; player++) {
      this.buttons[player] = (this.nextButtons[player] ?? 0) | (this.polledButtons[player] ?? 0);
    }
    this.prevKeys.clear();
    for (const key of this.keys) {
      this.prevKeys.add(key);
    }
    this.keys.clear();
    for (const key of this.nextKeys) {
      this.keys.add(key);
    }
    this.prevMouseButtons = this.mouseButtons;
    this.mouseButtons = this.nextMouseButtons;
    this.mouseX = this.nextMouseX;
    this.mouseY = this.nextMouseY;
  }

  // ---- queries --------------------------------------------------------------

  /** An action by the name the game gives it; a name the game does not have is never held. */
  btn(action: string, player = 0): boolean {
    return ((this.buttons[player] ?? 0) & (this.table.bits.get(action) ?? 0)) !== 0;
  }
  btnp(action: string, player = 0): boolean {
    const bit = this.table.bits.get(action) ?? 0;
    return (
      ((this.buttons[player] ?? 0) & bit) !== 0 && ((this.prevButtons[player] ?? 0) & bit) === 0
    );
  }
  btnr(action: string, player = 0): boolean {
    const bit = this.table.bits.get(action) ?? 0;
    return (
      ((this.buttons[player] ?? 0) & bit) === 0 && ((this.prevButtons[player] ?? 0) & bit) !== 0
    );
  }
  keyPressed(key: string): boolean {
    return this.keys.has(key);
  }
  keyDown(key: string): boolean {
    return this.keys.has(key) && !this.prevKeys.has(key);
  }
  mousePressed(button = 0): boolean {
    return (this.mouseButtons & (1 << button)) !== 0;
  }
  mouseDown(button = 0): boolean {
    return (
      (this.mouseButtons & (1 << button)) !== 0 && (this.prevMouseButtons & (1 << button)) === 0
    );
  }
}
