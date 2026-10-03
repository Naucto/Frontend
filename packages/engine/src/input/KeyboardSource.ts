import { type ActionBindings, ACTIONS, DEFAULT_BINDINGS } from './ActionMap';
import type { InputSource } from './InputSource';
import type { InputState } from './InputState';

/**
 * Keyboard + mouse on the game canvas. The canvas takes focus on pointerdown;
 * keys are cleared on blur so nothing sticks when the player tabs away.
 */
export class KeyboardSource implements InputSource {
  private bindings: ActionBindings;
  private detachFn: (() => void) | null = null;
  private readonly logicalWidth: number;
  private readonly logicalHeight: number;

  constructor(
    opts: { bindings?: ActionBindings; logicalWidth?: number; logicalHeight?: number } = {},
  ) {
    this.bindings = opts.bindings ?? DEFAULT_BINDINGS;
    this.logicalWidth = opts.logicalWidth ?? 320;
    this.logicalHeight = opts.logicalHeight ?? 180;
  }

  setBindings(b: ActionBindings): void {
    this.bindings = b;
  }

  attach(target: HTMLElement | null, state: InputState): void {
    this.detach();
    const onKeyDown = (e: KeyboardEvent): void => {
      // Only an element of its own takes the browser's keys from it; the window keeps them.
      if (target && !e.altKey && !e.ctrlKey && !e.metaKey) e.preventDefault();
      if (e.repeat) return;
      state.setKey(e.key, true);
      this.applyAction(state, e.key, true);
    };
    const onKeyUp = (e: KeyboardEvent): void => {
      state.setKey(e.key, false);
      this.applyAction(state, e.key, false);
    };
    const onBlur = (): void => {
      state.clearKeys();
      for (let p = 0; p < this.bindings.keyboard.length; p++) state.clearActions(p);
    };
    const keys: EventTarget = target ?? window;
    keys.addEventListener('keydown', onKeyDown as EventListener);
    keys.addEventListener('keyup', onKeyUp as EventListener);
    keys.addEventListener('blur', onBlur);
    const detachKeys = (): void => {
      keys.removeEventListener('keydown', onKeyDown as EventListener);
      keys.removeEventListener('keyup', onKeyUp as EventListener);
      keys.removeEventListener('blur', onBlur);
      onBlur();
    };
    // Without an element there is nothing to measure the mouse in.
    if (!target) {
      this.detachFn = detachKeys;
      return;
    }

    const onPointerDown = (e: PointerEvent): void => {
      target.focus({ preventScroll: true });
      this.updateMouse(target, state, e);
    };
    const onPointerMove = (e: PointerEvent): void => {
      this.updateMouse(target, state, e);
    };
    const onPointerUp = (e: PointerEvent): void => {
      this.updateMouse(target, state, e);
    };
    const onPointerLeave = (): void => {
      state.setMouse(null, null, 0);
    };
    target.addEventListener('pointerdown', onPointerDown);
    target.addEventListener('pointermove', onPointerMove);
    target.addEventListener('pointerup', onPointerUp);
    target.addEventListener('pointerleave', onPointerLeave);
    target.addEventListener('contextmenu', preventDefault);

    this.detachFn = () => {
      target.removeEventListener('pointerdown', onPointerDown);
      target.removeEventListener('pointermove', onPointerMove);
      target.removeEventListener('pointerup', onPointerUp);
      target.removeEventListener('pointerleave', onPointerLeave);
      target.removeEventListener('contextmenu', preventDefault);
      detachKeys();
    };
  }

  detach(): void {
    this.detachFn?.();
    this.detachFn = null;
  }

  private applyAction(state: InputState, key: string, down: boolean): void {
    this.bindings.keyboard.forEach((map, player) => {
      for (const action of ACTIONS)
        if (map[action].includes(key)) state.setAction(player, action, down);
    });
  }

  private updateMouse(target: HTMLElement, state: InputState, e: PointerEvent): void {
    const r = target.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    const x = Math.floor(((e.clientX - r.left) / r.width) * this.logicalWidth);
    const y = Math.floor(((e.clientY - r.top) / r.height) * this.logicalHeight);
    const inside = x >= 0 && x < this.logicalWidth && y >= 0 && y < this.logicalHeight;
    state.setMouse(inside ? x : null, inside ? y : null, e.buttons);
  }
}

const preventDefault = (e: Event): void => {
  e.preventDefault();
};
