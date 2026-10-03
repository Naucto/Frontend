import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';

/**
 * Switch, drawn as a bare pixel block with no rounding and no surrounding pill. `variant="chip"`
 * adds the inset container used when the switch carries a caption of its own.
 */
@Component({
  selector: 'nc-toggle',
  templateUrl: './toggle.component.html',
  host: { class: 'inline-flex' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToggleComponent {
  readonly checked = model(false);
  readonly disabled = input(false);
  readonly label = input<string>();
  readonly variant = input<'bare' | 'chip'>('bare');

  protected readonly buttonClass = computed(() =>
    [
      'group inline-flex cursor-pointer items-center gap-[9px] font-mono text-meta uppercase tracking-button',
      'text-ink-3 transition-colors duration-100 aria-checked:text-ink-body disabled:cursor-not-allowed disabled:opacity-40',
      this.variant() === 'chip'
        ? 'h-4 rounded-sm border border-line bg-inset px-[10px] hover:border-line-strong'
        : '',
    ].join(' '),
  );
}
