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
    // Keys are read from the window; only the mouse needs an element to measure against.
    if (!target) {
      this.attachKeys(state);
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
    const onKeyDown = (e: KeyboardEvent): void => {
      if (!e.altKey && !e.ctrlKey && !e.metaKey) e.preventDefault();
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
      for (let p = 0; p < this.bindings.keyboard.length; p++) state.setButtons(p, 0);
    };

    target.addEventListener('pointerdown', onPointerDown);
    target.addEventListener('pointermove', onPointerMove);
    target.addEventListener('pointerup', onPointerUp);
    target.addEventListener('pointerleave', onPointerLeave);
    target.addEventListener('keydown', onKeyDown);
    target.addEventListener('keyup', onKeyUp);
    target.addEventListener('blur', onBlur);
    target.addEventListener('contextmenu', preventDefault);

    this.detachFn = () => {
      target.removeEventListener('pointerdown', onPointerDown);
      target.removeEventListener('pointermove', onPointerMove);
      target.removeEventListener('pointerup', onPointerUp);
      target.removeEventListener('pointerleave', onPointerLeave);
      target.removeEventListener('keydown', onKeyDown);
      target.removeEventListener('keyup', onKeyUp);
      target.removeEventListener('blur', onBlur);
      target.removeEventListener('contextmenu', preventDefault);
      onBlur();
    };
  }

  detach(): void {
    this.detachFn?.();
    this.detachFn = null;
  }

  /** Keys only, bound to the window — used when the source has no element to measure the mouse in. */
  private attachKeys(state: InputState): void {
    const onKeyDown = (e: KeyboardEvent): void => {
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
      for (let p = 0; p < this.bindings.keyboard.length; p++) state.setButtons(p, 0);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    this.detachFn = () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      onBlur();
    };
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
