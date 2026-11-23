import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  model,
  signal,
} from '@angular/core';

import { closedBy } from './disabled-scope.directive';

/** How far the knob goes from off to on: the track's width less the knob's. */
const TRAVEL = 24;
/** A pointer that moved less than this was a press, not a drag. */
const SLACK = 3;

interface Drag {
  from: number;
  base: number;
  offset: number;
  moved: boolean;
}

/**
 * Switch: a raised knob in a well, jade once on. The knob can be pressed or dragged; let go, it
 * settles on the side it is nearest. `variant="chip"` adds the inset container used when the switch
 * carries a caption of its own.
 */
@Component({
  selector: 'nc-toggle',
  templateUrl: './toggle.component.html',
  host: { class: 'inline-flex' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToggleComponent {
  readonly checked = model(false);
  readonly disabled = input(false, { transform: booleanAttribute });
  protected readonly closed = closedBy(() => this.disabled());
  readonly label = input<string>();
  readonly variant = input<'bare' | 'chip'>('bare');

  protected readonly drag = signal<Drag | null>(null);
  /** A drag ends on a click of its own, which must not flip what the drag just settled. */
  private settled = false;

  protected readonly offset = computed(() => this.drag()?.offset ?? (this.checked() ? TRAVEL : 0));

  protected readonly buttonClass = computed(() =>
    [
      'group inline-flex touch-pan-y items-center gap-[12px] font-ui text-meta uppercase tracking-button',
      'text-ink-3 enabled:aria-checked:text-ink-body disabled:cursor-not-allowed disabled:text-ink-4',
      this.variant() === 'chip' ? 'flat-sm bevel-fill-inset h-(--nc-h-lg) pr-[12px] pl-[6px]' : '',
    ].join(' '),
  );

  protected flip(): void {
    if (this.settled) {
      this.settled = false;
      return;
    }
    this.checked.set(!this.checked());
  }

  protected grab(event: PointerEvent): void {
    if (this.closed()) {
      return;
    }
    const target = event.currentTarget as HTMLElement;
    // Not every DOM has pointer capture; without it the drag ends at the button's edge.
    if ('setPointerCapture' in target) {
      target.setPointerCapture(event.pointerId);
    }
    const base = this.checked() ? TRAVEL : 0;
    this.drag.set({ from: event.clientX, base, offset: base, moved: false });
  }

  protected slide(event: PointerEvent): void {
    const drag = this.drag();
    if (!drag) {
      return;
    }
    const delta = event.clientX - drag.from;
    this.drag.set({
      ...drag,
      offset: Math.max(0, Math.min(TRAVEL, drag.base + delta)),
      moved: drag.moved || Math.abs(delta) > SLACK,
    });
  }

  protected release(): void {
    const drag = this.drag();
    if (!drag) {
      return;
    }
    this.drag.set(null);
    if (drag.moved) {
      this.settled = true;
      this.checked.set(drag.offset > TRAVEL / 2);
    }
  }
}
