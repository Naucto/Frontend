import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Which side of the column draws the hairline that separates it from what it sits beside. */
export type PanelEdge = 'left' | 'right' | 'none';

const EDGE: Record<PanelEdge, string> = {
  left: 'border-l border-line',
  right: 'border-r border-line',
  none: '',
};

/**
 * A fixed-width column of editor furniture: one head row, then whatever it holds.
 *
 * The width arrives as a number rather than a class because Tailwind reads source text and cannot
 * see a computed one. A column establishes a positioned ancestor, so an `nc-edge-handle` inside it
 * hangs on its edge.
 *
 * With a title the head row reads left to right as name then controls; without one the controls
 * start at the left, which is what a toolbar wants.
 */
@Component({
  selector: 'nc-panel-column',
  template: `
    <div class="flex h-(--nc-bar-h) shrink-0 items-center gap-1 border-b border-line px-1.5">
      @if (title()) {
        <span class="label text-ink">{{ title() }}</span>
        <span class="flex-1"></span>
      }
      <ng-content select="[actions]" />
    </div>
    <ng-content />
  `,
  host: {
    class: 'relative flex min-h-0 flex-col overflow-auto bg-panel',
    '[class]': 'edgeClass()',
    '[style.width.px]': 'width()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PanelColumnComponent {
  readonly title = input<string>();
  readonly width = input<number>();
  readonly edge = input<PanelEdge>('left');

  protected readonly edgeClass = computed(() => EDGE[this.edge()]);
}
