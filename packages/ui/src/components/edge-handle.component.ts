import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { type MarkName } from '../icons/glyphs';
import { MarkComponent } from './mark.component';

/**
 * The grip a column hangs on its own edge — what folds it away, and what brings it back.
 *
 * Positioned against the nearest positioned ancestor, so the column it belongs to must establish
 * one. It carries no state: the caller owns what the press means and which mark says so.
 */
@Component({
  selector: 'nc-edge-handle',
  imports: [MarkComponent],
  templateUrl: './edge-handle.component.html',
  host: { class: 'absolute top-1/2 -left-[15px] z-20 -translate-y-1/2' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EdgeHandleComponent {
  readonly mark = input.required<MarkName>();
  readonly label = input.required<string>();
  readonly pressed = output();
}
