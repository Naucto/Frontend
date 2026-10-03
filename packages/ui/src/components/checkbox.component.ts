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
 * The box is drawn rather than taken from the glyph set, which has no empty box to pair with its
 * ticked one.
 */
@Component({
  selector: 'nc-checkbox',
  imports: [IconComponent],
  templateUrl: './checkbox.component.html',
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
