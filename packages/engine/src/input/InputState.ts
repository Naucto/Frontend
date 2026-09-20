import { type Action, ACTION_BIT, MAX_PLAYERS } from './ActionMap';

/**
 * Snapshot of all inputs for one fixed step. Sources write into `next`; the
 * engine calls `commit()` at the top of every step so the game sees a stable
 * frame and pressed/released edges are per step, not per event.
 *
 * Buttons come in on two lanes that only meet at `commit()`: event sources (keyboard, touch)
 * flip bits as they happen, and polled sources (gamepad) rewrite their whole mask every step.
 * Kept apart, a pad's poll cannot erase a key that is still down, and a key's release cannot
 * clear a pad's bit.
 */
export class InputState {
  readonly buttons = new Uint16Array(MAX_PLAYERS);
  readonly prevButtons = new Uint16Array(MAX_PLAYERS);
  private readonly nextButtons = new Uint16Array(MAX_PLAYERS);
  private readonly polledButtons = new Uint16Array(MAX_PLAYERS);

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

  /**
   * Forget what is held, for a run that is starting.
   *
   * A key held when the last game halted was already down on the new one's first step -- and
   * `btnp` did not fire for it, because the previous frame carried over too, so the press had no
   * edge to be found on. `connectedPlayers` is not touched: it counts the pads that are plugged
   * in, which is not something a game left behind.
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
    if (down) this.nextKeys.add(key);
    else this.nextKeys.delete(key);
  }

  clearKeys(): void {
    this.nextKeys.clear();
  }

  setAction(player: number, action: Action, down: boolean): void {
    if (player < 0 || player >= MAX_PLAYERS) return;
    if (down) this.nextButtons[player] = (this.nextButtons[player] ?? 0) | ACTION_BIT[action];
    else this.nextButtons[player] = (this.nextButtons[player] ?? 0) & ~ACTION_BIT[action];
  }

  clearActions(player: number): void {
    if (player >= 0 && player < MAX_PLAYERS) this.nextButtons[player] = 0;
  }

  /** Replace a polled source's whole mask for a player; it holds until the next poll. */
  setPolled(player: number, mask: number): void {
    if (player >= 0 && player < MAX_PLAYERS) this.polledButtons[player] = mask;
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
    for (let p = 0; p < MAX_PLAYERS; p++)
      this.buttons[p] = (this.nextButtons[p] ?? 0) | (this.polledButtons[p] ?? 0);
    this.prevKeys.clear();
    for (const k of this.keys) this.prevKeys.add(k);
    this.keys.clear();
    for (const k of this.nextKeys) this.keys.add(k);
    this.prevMouseButtons = this.mouseButtons;
    this.mouseButtons = this.nextMouseButtons;
    this.mouseX = this.nextMouseX;
    this.mouseY = this.nextMouseY;
  }

  // ---- queries --------------------------------------------------------------

  btn(action: Action, player = 0): boolean {
    return ((this.buttons[player] ?? 0) & ACTION_BIT[action]) !== 0;
  }
  btnp(action: Action, player = 0): boolean {
    const bit = ACTION_BIT[action];
    return (
      ((this.buttons[player] ?? 0) & bit) !== 0 && ((this.prevButtons[player] ?? 0) & bit) === 0
    );
  }
  btnr(action: Action, player = 0): boolean {
    const bit = ACTION_BIT[action];
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
