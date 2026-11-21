import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  model,
  output,
} from '@angular/core';

import { CELL, CELL_ON } from './selection-styles';

/** Fill of the checked state; gold is the neutral "on", jade and sky carry meaning. */
export type ToggleAccent = 'gold' | 'jade' | 'sky';

/** The neutral "on" is the primary fill, which is gold only in the dark theme. */
const ACTIVE: Record<ToggleAccent, string> = {
  gold: CELL_ON.primary,
  jade: CELL_ON.jade,
  sky: CELL_ON.sky,
};

/** Raised on/off button with icon + label (GRID, ONION, FLAGS, LOOP): latched, it stays down. */
@Component({
  selector: 'nc-toggle-button',
  templateUrl: './toggle-button.component.html',
  host: { class: 'inline-flex' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToggleButtonComponent {
  readonly checked = model(false);
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly label = input<string>();
  readonly accent = input<ToggleAccent>('gold');
  /** `strip` stands as tall as a button of the strip it sits in. */
  readonly size = input<'control' | 'strip'>('control');

  /**
   * Whether the lit state is decided elsewhere.
   *
   * Left to itself the button writes its own state on every press, which is right for the ones that
   * are only on or off. It is wrong for a button that cycles through several values: there the
   * press means "next", and whether the lamp stays lit is the caller's answer, not the button's.
   * Worse, an input binding that works out to the same value it already had has nothing to correct
   * the button with — so the lamp would go out while the setting was still on.
   */
  readonly controlled = input(false);

  /** Pressed. For a button that is not controlled, `checkedChange` already says as much. */
  readonly activated = output();

  protected readonly buttonClass = computed(
    () =>
      `${CELL} ${ACTIVE[this.accent()]} inline-flex items-center gap-[6px] px-[10px] font-ui text-label tracking-tag whitespace-nowrap uppercase text-ink-3 ${
        this.size() === 'strip' ? 'h-(--nc-h-md)' : 'h-(--nc-h-sm)'
      }`,
  );

  protected press(): void {
    this.activated.emit();
    if (!this.controlled()) {
      this.checked.set(!this.checked());
    }
  }
}
