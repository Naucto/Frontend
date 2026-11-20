import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import type { FlyoutPlacement } from './shelf-layout';

/**
 * The lit frame that opens around a shelf item and holds what is said of it on one side. The item
 * itself is not in it: the frame leaves a gap its size and the item stands over that gap. What is
 * said is cut at the frame when a narrow shelf leaves it less room than it needs, from its end.
 */
@Component({
  selector: 'nc-shelf-flyout',
  templateUrl: './shelf-flyout.component.html',
  styleUrl: './shelf-flyout.component.css',
  host: {
    class: 'raised-lg bevel-lit bevel-fill-raised absolute flex',
    '[class.open]': 'open()',
    '[class.flex-row-reverse]': 'placement().side === "left"',
    '[attr.aria-hidden]': '!open()',
    '[style.inset-block.px]': '-16 - placement().rise',
    '[style.width.px]': 'placement().width',
    '[style.left.px]': 'placement().side === "right" ? -16 - placement().gutter : null',
    '[style.right.px]': 'placement().side === "left" ? -16 - placement().gutter : null',
    '[style.--shift]': 'placement().side === "right" ? "-12px" : "12px"',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShelfFlyoutComponent {
  readonly placement = input.required<FlyoutPlacement>();
  readonly itemWidth = input.required<number>();
  readonly open = input(false);
}
