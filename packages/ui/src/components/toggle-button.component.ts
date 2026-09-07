import { ChangeDetectionStrategy, Component, computed, input, model, output } from '@angular/core';

/** Accent of the checked state; gold is the neutral "on", jade and sky carry meaning. */
export type ToggleAccent = 'gold' | 'jade' | 'sky';

/**
 * The checked state is a *fill*, not just a coloured outline — the design tints the whole button
 * (`#2A2621` for gold, a 12 % accent wash for jade and sky) so an active overlay reads at a glance.
 */
const ACTIVE: Record<ToggleAccent, string> = {
  gold: 'aria-checked:border-line-strong aria-checked:bg-line aria-checked:text-gold-ink',
  jade: 'aria-checked:border-jade aria-checked:bg-[color-mix(in_srgb,var(--color-jade)_12%,var(--color-page))] aria-checked:text-jade-ink',
  sky: 'aria-checked:border-sky aria-checked:bg-[color-mix(in_srgb,var(--color-sky)_12%,var(--color-page))] aria-checked:text-sky-ink',
};

/** Bordered on/off button with icon + label (GRID, ONION, FLAGS, LOOP). */
@Component({
  selector: 'nc-toggle-button',
  template: `
    <button
      type="button"
      role="switch"
      [attr.aria-checked]="checked()"
      [attr.aria-label]="label()"
      [disabled]="disabled()"
      (click)="press()"
      class="label tracking-tag inline-flex h-[26px] cursor-pointer items-center gap-0.5 rounded-sm border border-line bg-transparent px-1 text-ink-4 transition-[color] duration-100 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
      [class]="active()"
    >
      <ng-content />
    </button>
  `,
  host: { class: 'inline-flex' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToggleButtonComponent {
  readonly checked = model(false);
  readonly disabled = input(false);
  readonly label = input<string>();
  readonly accent = input<ToggleAccent>('gold');

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

  protected press(): void {
    this.activated.emit();
    if (!this.controlled()) this.checked.set(!this.checked());
  }
}
