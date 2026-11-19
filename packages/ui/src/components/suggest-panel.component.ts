import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * The list that drops out of a search box.
 *
 * A frame of its own, two pixels under the box and standing off the page by a pixel shadow. Its own
 * scroll is capped, because what it lists is unbounded and the box under it is not.
 *
 * It carries no z-index on purpose. Being positioned already lifts it over its static siblings, and
 * clearing the *page* is not something it can settle from in here — a z-index on a child only
 * orders it inside its parent's subtree. That belongs to whatever bar this drops out of.
 */
@Component({
  selector: 'nc-suggest-panel',
  templateUrl: './suggest-panel.component.html',
  host: {
    class:
      'flat-lg bevel-fill-panel absolute inset-x-0 top-full mt-[6px] [filter:drop-shadow(0_6px_0_var(--nc-well))]',
    // A press in here must not take the caret out of the field: whatever watches the field for a
    // blur closes this, and the panel would be gone before the click landed on anything.
    '(mousedown)': '$event.preventDefault()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SuggestPanelComponent {
  readonly label = input('Suggestions');
}
