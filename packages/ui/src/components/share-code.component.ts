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
 * A short code to hand to somebody, with copy and — where the caller can mint a new one —
 * regenerate. Shown uppercase: a lowercase code and its uppercase twin are the same code.
 */
@Component({
  selector: 'nc-share-code',
  imports: [ButtonDirective, IconComponent, ReadoutComponent],
  templateUrl: './share-code.component.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShareCodeComponent {
  readonly code = input<string | null | undefined>(null);
  /** Show the regenerate action. */
  readonly regenerable = input(false, { transform: booleanAttribute });
  readonly copyLabel = input('Copy code');
  readonly regenerateLabel = input('Generate a new code');

  readonly copied = output();
  readonly regenerate = output();

  /** Eight dots, one per character of a real code, so the box does not resize when it lands. */
  protected readonly shown = computed(() => {
    // A code can arrive as an empty string, and that still wants the dots. And L46-47 become
    // `return (this.code() ?? '').toUpperCase() || '········';
    const c = (this.code() ?? '').toUpperCase();
    return c.length > 0 ? c : '········';
  });
}
