import { type Action } from './ActionMap';
import type { InputSource } from './InputSource';
import type { InputState } from './InputState';

/**
 * On-screen pad. Unlike the keyboard, this source owns its own element — the pad lives in a zone
 * below the screen (portrait) or overlays its edges (landscape) — so it ignores the target the
 * engine offers and binds to the element handed to the constructor.
 *
 * Every control carries `data-nc-action="left"`. Touches are tracked by pointer id and re-hit-test
 * on move, so sliding a thumb from LEFT to UP behaves the way a real d-pad does rather than
 * sticking to whatever was pressed first.
 */
export class TouchSource implements InputSource {
  private readonly root: HTMLElement;
  private readonly player: number;
  private state: InputState | null = null;
  private detachFn: (() => void) | null = null;
  /** Which action each live pointer is currently over. */
  private readonly held = new Map<number, Action>();

  constructor(root: HTMLElement, opts: { player?: number } = {}) {
    this.root = root;
    this.player = opts.player ?? 0;
  }

  attach(_target: HTMLElement | null, state: InputState): void {
    this.detach();
    this.state = state;

    const actionAt = (event: PointerEvent): Action | null => {
      const el = document.elementFromPoint(event.clientX, event.clientY);
      const owner = el?.closest<HTMLElement>('[data-nc-action]');
      const name = owner?.dataset.ncAction;
      return name ? (name as Action) : null;
    };

    const apply = (id: number, action: Action | null): void => {
      const previous = this.held.get(id);
      if (previous === action) {
        return;
      }
      if (previous) {
        this.release(previous, id);
      }
      if (action) {
        this.held.set(id, action);
        state.setAction(this.player, action, true);
      } else {
        this.held.delete(id);
      }
    };

    const onDown = (event: PointerEvent): void => {
      const action = actionAt(event);
      if (!action) {
        return;
      }
      event.preventDefault();
      this.root.setPointerCapture?.(event.pointerId);
      apply(event.pointerId, action);
    };
    const onMove = (event: PointerEvent): void => {
      if (!this.held.has(event.pointerId)) {
        return;
      }
      event.preventDefault();
      apply(event.pointerId, actionAt(event));
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

  private release(action: Action, id: number): void {
    this.held.delete(id);
    // Two thumbs can be on the same button; only lift it when the last one goes.
    for (const held of this.held.values()) {
      if (held === action) {
        return;
      }
    }
    this.state?.setAction(this.player, action, false);
  }

  private releaseAll(): void {
    for (const [id, action] of [...this.held]) {
      this.release(action, id);
    }
    this.held.clear();
  }
}
