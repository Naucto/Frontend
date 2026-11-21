import { SCREEN_HEIGHT, SCREEN_WIDTH } from '../game/keys';
import { canonicalKey } from './actions';
import type { InputSource } from './InputSource';
import type { InputState } from './InputState';

/**
 * Keyboard + mouse on the game canvas. The canvas takes focus on pointerdown;
 * keys are cleared on blur so nothing sticks when the player tabs away. A key presses the actions
 * the running game plugs it into, for the first or the second player.
 */
export class KeyboardSource implements InputSource {
  private detachFn: (() => void) | null = null;
  private readonly logicalWidth: number;
  private readonly logicalHeight: number;

  constructor(opts: { logicalWidth?: number; logicalHeight?: number } = {}) {
    this.logicalWidth = opts.logicalWidth ?? SCREEN_WIDTH;
    this.logicalHeight = opts.logicalHeight ?? SCREEN_HEIGHT;
  }

  attach(target: HTMLElement | null, state: InputState): void {
    this.detach();
    const onKeyDown = (event: KeyboardEvent): void => {
      // Only an element of its own takes the browser's keys from it; the window keeps them.
      if (target && !event.altKey && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
      }
      if (event.repeat) {
        return;
      }
      state.setKey(event.key, true);
      this.applyAction(state, event.key, true);
    };
    const onKeyUp = (event: KeyboardEvent): void => {
      state.setKey(event.key, false);
      this.applyAction(state, event.key, false);
    };
    const onBlur = (): void => {
      state.clearKeys();
      state.actions.keys.forEach((_keys, player) => {
        state.clearActions(player);
      });
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

    const onPointerDown = (event: PointerEvent): void => {
      target.focus({ preventScroll: true });
      this.updateMouse(target, state, event);
    };
    const onPointerMove = (event: PointerEvent): void => {
      this.updateMouse(target, state, event);
    };
    const onPointerUp = (event: PointerEvent): void => {
      this.updateMouse(target, state, event);
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
    const pressed = canonicalKey(key);
    state.actions.keys.forEach((keys, player) => {
      const mask = keys.get(pressed);
      if (mask !== undefined) {
        state.press(player, mask, down);
      }
    });
  }

  private updateMouse(target: HTMLElement, state: InputState, event: PointerEvent): void {
    const rect = target.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return;
    }
    const x = Math.floor(((event.clientX - rect.left) / rect.width) * this.logicalWidth);
    const y = Math.floor(((event.clientY - rect.top) / rect.height) * this.logicalHeight);
    const inside = x >= 0 && x < this.logicalWidth && y >= 0 && y < this.logicalHeight;
    state.setMouse(inside ? x : null, inside ? y : null, event.buttons);
  }
}

const preventDefault = (event: Event): void => {
  event.preventDefault();
};
