import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  model,
} from '@angular/core';

import { IconComponent } from './icon.component';

/**
 * A choice that stands on its own, against a switch, which turns something on.
 *
 * The box is drawn rather than taken from the glyph set, whose two checkbox marks both carry a
 * tick — there is no empty one to pair them with, and a box that reads as ticked when it is not is
 * worse than no box.
 */
@Component({
  selector: 'nc-checkbox',
  imports: [IconComponent],
  template: `
    <button
      type="button"
      role="checkbox"
      [attr.aria-checked]="checked()"
      [attr.aria-label]="label()"
      [disabled]="disabled()"
      (click)="checked.set(!checked())"
      [class]="buttonClass()"
    >
      <span [class]="boxClass()">
        @if (checked()) {
          <nc-icon name="check" [size]="12" />
        }
      </span>
      <ng-content />
    </button>
  `,
  host: { class: 'inline-flex' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckboxComponent {
  readonly checked = model(false);
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly label = input<string>();

  protected readonly buttonClass = computed(() =>
    [
      'group inline-flex cursor-pointer items-center gap-0.75 font-mono text-meta uppercase tracking-button',
      'text-ink-3 transition-colors duration-100 hover:text-ink aria-checked:text-ink-body',
      'disabled:cursor-not-allowed disabled:opacity-40',
      this.checked() ? 'text-gold-ink hover:text-gold-ink' : '',
    ].join(' '),
  );

  protected readonly boxClass = computed(() =>
    [
      'inline-flex h-[14px] w-[14px] shrink-0 items-center justify-center border',
      this.checked() ? 'border-gold text-gold-ink' : 'border-line-strong',
    ].join(' '),
  );
}
