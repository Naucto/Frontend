import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { type IconName } from '../icons/paths';
import { IconComponent } from './icon.component';

/**
 * The grip a column hangs on its own edge — what folds it away, and what brings it back.
 *
 * Positioned against the nearest positioned ancestor, so the column it belongs to must establish
 * one. It carries no state: the caller owns what the press means and which glyph says so.
 */
@Component({
  selector: 'nc-edge-handle',
  imports: [IconComponent],
  template: `
    <button
      type="button"
      class="flex h-[52px] w-2 items-center justify-center rounded-[8px] border border-line-strong bg-raised text-ink-2 hover:text-ink"
      [attr.aria-label]="label()"
      (click)="pressed.emit()"
    >
      <nc-icon [name]="icon()" [size]="12" />
    </button>
  `,
  host: { class: 'absolute top-1/2 -left-1 z-20 -translate-y-1/2' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EdgeHandleComponent {
  readonly icon = input.required<IconName>();
  readonly label = input.required<string>();
  readonly pressed = output();
}
