import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * The list that drops out of a search box.
 *
 * It and the box are one piece: the box loses its bottom corners while this is open and this loses
 * its top border, so the pair reads as a single bordered well rather than a card floating under a
 * field. Its own scroll is capped, because what it lists is unbounded and the box under it is not.
 */
@Component({
  selector: 'nc-suggest-panel',
  template: `
    <div class="max-h-[336px] overflow-y-auto" role="listbox" [attr.aria-label]="label()">
      <ng-content />
    </div>
    <div class="border-t border-line px-[14px] py-[9px] empty:hidden">
      <ng-content select="[footer]" />
    </div>
  `,
  host: {
    class: 'absolute inset-x-0 top-full z-40 rounded-b-sm border-x border-b border-line bg-panel',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SuggestPanelComponent {
  readonly label = input('Suggestions');
}
