import { ChangeDetectionStrategy, Component, computed, input, model, output } from '@angular/core';

/** Accent of the checked state; gold is the neutral "on", jade and sky carry meaning. */
export type ToggleAccent = 'gold' | 'jade' | 'sky';

/**
 * The checked state is a *fill*, not just a coloured outline, so an active overlay reads at a
 * glance.
 */
const ACTIVE: Record<ToggleAccent, string> = {
  gold: 'aria-checked:border-line-strong aria-checked:bg-line aria-checked:text-gold-ink',
  jade: 'aria-checked:border-jade aria-checked:bg-[color-mix(in_srgb,var(--color-jade)_12%,var(--color-page))] aria-checked:text-jade-ink',
  sky: 'aria-checked:border-sky aria-checked:bg-[color-mix(in_srgb,var(--color-sky)_12%,var(--color-page))] aria-checked:text-sky-ink',
};

/** Bordered on/off button with icon + label (GRID, ONION, FLAGS, LOOP). */
@Component({
  selector: 'nc-toggle-button',
  templateUrl: './toggle-button.component.html',
  host: { class: 'inline-flex' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToggleButtonComponent {
  readonly checked = model(false);
  readonly disabled = input(false);
  readonly label = input<string>();
  readonly accent = input<ToggleAccent>('gold');
  /** `strip` stands as tall as a framed group on the same line, like a button of that size. */
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

  protected readonly active = computed(() => ACTIVE[this.accent()]);
  protected readonly height = computed(() =>
    this.size() === 'strip' ? 'h-(--nc-transport-h)' : 'h-(--nc-control-h)',
  );

  protected press(): void {
    this.activated.emit();
    if (!this.controlled()) {
      this.checked.set(!this.checked());
    }
  }
}
