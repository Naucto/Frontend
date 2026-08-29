import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';

/**
 * Switch. The design draws it as a bare notched pixel block — a 30×16 track with a 10×10 knob and
 * clipped corners, no rounding and no surrounding pill. `variant="chip"` adds the inset container
 * used when the switch carries a caption of its own (AUTO-RUN, HAPTICS).
 */
@Component({
  selector: 'nc-toggle',
  template: `
    <button
      type="button"
      role="switch"
      [attr.aria-checked]="checked()"
      [attr.aria-label]="label()"
      [disabled]="disabled()"
      (click)="checked.set(!checked())"
      [class]="buttonClass()"
    >
      <span
        class="nc-track relative inline-block h-2 w-[30px] bg-line-strong transition-colors duration-100 group-aria-checked:bg-jade"
      >
        <span
          class="absolute top-[3px] left-[3px] h-[10px] w-[10px] bg-ink-3 transition-[transform,background-color] duration-100 group-aria-checked:translate-x-[14px] group-aria-checked:bg-page"
        ></span>
      </span>
      <ng-content />
    </button>
  `,
  styles: `
    /* Corners clipped rather than rounded — the switch is drawn on the pixel grid. */
    .nc-track {
      clip-path: polygon(
        3px 0,
        calc(100% - 3px) 0,
        100% 3px,
        100% calc(100% - 3px),
        calc(100% - 3px) 100%,
        3px 100%,
        0 calc(100% - 3px),
        0 3px
      );
    }
  `,
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
