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

/**
 * The code someone hands out so a friend can add them, with copy and (optionally) regenerate.
 *
 * One component because the app had grown four renderings of the same `friendCode` field — three
 * sizes, two tracking values, two placeholders and three different boxes — so the code looked like
 * a different kind of thing depending on where you met it. The design draws one box in both places
 * it appears: sunken well, strong border, 10px gap, 22px ghost affordances, the code in gold mono.
 *
 * It is shown uppercase because that is how the design writes it and how the add-friend field
 * sends it; a lowercase code and its uppercase twin are the same code.
 */
@Component({
  selector: 'nc-friend-code',
  imports: [ButtonDirective, IconComponent],
  template: `
    <div
      class="flex items-center gap-1.25 rounded-sm border border-line-strong bg-inset px-[11px] py-[9px]"
    >
      <span class="flex-1 font-mono text-[14px] tracking-strip text-gold-ink">{{ shown() }}</span>
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
    </div>
  `,
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FriendCodeComponent {
  readonly code = input<string | null | undefined>(null);
  /** Show the regenerate action. Only the owner's own settings offer it. */
  readonly regenerable = input(false, { transform: booleanAttribute });
  readonly copyLabel = input('Copy friend code');
  readonly regenerateLabel = input('Generate a new friend code');

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
