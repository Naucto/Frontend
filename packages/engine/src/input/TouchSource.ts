import type { InputSource } from './InputSource';
import type { InputState } from './InputState';
import { TOUCH_CONTROLS, type TouchControl, touchPresses } from './touch-pad';

/** The bits of every action a control of the on-screen pad presses. */
function maskOf(state: InputState, control: TouchControl): number {
  return touchPresses(control).reduce(
    (mask, pressed) => mask | (state.actions.pad.get(pressed) ?? 0),
    0,
  );
}

/**
 * On-screen pad: a gamepad drawn on the screen, pressing for one player the actions the running
 * game plugs its controls into. Unlike the keyboard, this source owns its own element — the pad
 * lives in a zone below the screen (portrait) or overlays its edges (landscape) — so it ignores the
 * target the engine offers and binds to the element handed to the constructor.
 *
 * Every control carries `data-nc-control="dpad-left"`. Touches are tracked by pointer id and
 * re-hit-test on move, so sliding a thumb from LEFT to UP behaves the way a real d-pad does rather
 * than sticking to whatever was pressed first.
 */
export class TouchSource implements InputSource {
  private readonly root: HTMLElement;
  private readonly player: number;
  private state: InputState | null = null;
  private detachFn: (() => void) | null = null;
  /** Which control each live pointer is currently over. */
  private readonly held = new Map<number, TouchControl>();

  constructor(root: HTMLElement, opts: { player?: number } = {}) {
    this.root = root;
    this.player = opts.player ?? 0;
  }

  attach(_target: HTMLElement | null, state: InputState): void {
    this.detach();
    this.state = state;

    const controlAt = (event: PointerEvent): TouchControl | null => {
      const el = document.elementFromPoint(event.clientX, event.clientY);
      const name = el?.closest<HTMLElement>('[data-nc-control]')?.dataset.ncControl;

      return TOUCH_CONTROLS.find((control) => control === name) ?? null;
    };

    const apply = (id: number, control: TouchControl | null): void => {
      const previous = this.held.get(id);
      if (previous === control) {
        return;
      }
      if (previous) {
        this.release(previous, id);
      }
      if (control) {
        this.held.set(id, control);
        state.press(this.player, maskOf(state, control), true);
      } else {
        this.held.delete(id);
      }
    };

    const onDown = (event: PointerEvent): void => {
      const control = controlAt(event);
      if (!control) {
        return;
      }
      event.preventDefault();
      this.root.setPointerCapture?.(event.pointerId);
      apply(event.pointerId, control);
    };
    const onMove = (event: PointerEvent): void => {
      if (!this.held.has(event.pointerId)) {
        return;
      }
      event.preventDefault();
      apply(event.pointerId, controlAt(event));
    };
    const onUp = (event: PointerEvent): void => {
      apply(event.pointerId, null);
    };

    this.root.addEventListener('pointerdown', onDown);
    this.root.addEventListener('pointermove', onMove);
    this.root.addEventListener('pointerup', onUp);
    this.root.addEventListener('pointercancel', onUp);
    // A pad that keeps a direction held while the tab is in the background walks the player into
    // a wall; drop everything when the page goes away.
    const onHidden = (): void => {
      this.releaseAll();
    };
    document.addEventListener('visibilitychange', onHidden);

    this.detachFn = () => {
      this.root.removeEventListener('pointerdown', onDown);
      this.root.removeEventListener('pointermove', onMove);
      this.root.removeEventListener('pointerup', onUp);
      this.root.removeEventListener('pointercancel', onUp);
      document.removeEventListener('visibilitychange', onHidden);
    };
  }

  detach(): void {
    this.releaseAll();
    this.detachFn?.();
    this.detachFn = null;
    this.state = null;
  }

  private release(control: TouchControl, id: number): void {
    this.held.delete(id);
    // Two thumbs can be on the same button; only lift it when the last one goes.
    for (const held of this.held.values()) {
      if (held === control) {
        return;
      }
    }
    if (this.state) {
      this.state.press(this.player, maskOf(this.state, control), false);
    }
  }

  private releaseAll(): void {
    for (const [id, control] of [...this.held]) {
      this.release(control, id);
    }
    this.held.clear();
  }
}
