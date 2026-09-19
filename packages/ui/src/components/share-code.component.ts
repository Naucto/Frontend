import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';

import { ButtonDirective } from './button.directive';
import { IconComponent } from './icon.component';
import { ReadoutComponent } from './readout.component';

/**
 * A short code to hand to somebody, with copy and — where the caller can mint a new one — regenerate.
 *
 * One component because the app had grown four renderings of the same field — three sizes, two
 * tracking values, two placeholders and three different boxes — so a code looked like a different
 * kind of thing depending on where you met it. The design draws one box: sunken well, strong
 * border, 10px gap, 22px ghost affordances, the code in gold mono.
 *
 * It is shown uppercase because that is how the design writes one, and because a lowercase code
 * and its uppercase twin are the same code.
 */
@Component({
  selector: 'nc-share-code',
  imports: [ButtonDirective, IconComponent, ReadoutComponent],
  template: `
    <nc-readout [value]="shown()" tone="gold">
      @if (regenerable()) {
        <button
          type="button"
          ncButton
          variant="ghost"
          size="xs"
          iconOnly
          [attr.aria-label]="regenerateLabel()"
          [attr.title]="regenerateLabel()"
          [disabled]="!code()"
          (click)="regenerate.emit()"
        >
          <nc-icon name="sync" [size]="12" />
        </button>
      }
      <button
        type="button"
        ncButton
        variant="ghost"
        size="xs"
        iconOnly
        [attr.aria-label]="copyLabel()"
        [attr.title]="copyLabel()"
        [disabled]="!code()"
        (click)="copied.emit()"
      >
        <nc-icon name="copy" [size]="12" />
      </button>
    </nc-readout>
  `,
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShareCodeComponent {
  readonly code = input<string | null | undefined>(null);
  /** Show the regenerate action. Only the owner's own settings offer it. */
  readonly regenerable = input(false, { transform: booleanAttribute });
  readonly copyLabel = input('Copy code');
  readonly regenerateLabel = input('Generate a new code');

  readonly copied = output();
  readonly regenerate = output();

  /** Eight dots, one per character of a real code, so the box does not resize when it lands. */
  protected readonly shown = computed(() => {
    // Length rather than truthiness, and not `??`: a code can arrive as an empty string — the
    // friends page reads it out of a query that has not resolved — and that still wants the dots.
    const c = (this.code() ?? '').toUpperCase();
    return c.length > 0 ? c : '········';
  });
}
