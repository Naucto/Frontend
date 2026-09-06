import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { type PresenceColour } from './avatar.component';

const TEXT: Record<PresenceColour, string> = {
  sky: 'text-presence-sky',
  blush: 'text-presence-blush',
  jade: 'text-presence-jade',
};
const FILL: Record<PresenceColour, string> = {
  sky: 'bg-presence-sky',
  blush: 'bg-presence-blush',
  jade: 'bg-presence-jade',
};

/**
 * Where a collaborator's pointer is, with their name hung at the ninth of the mark's fifteen rows —
 * which is what the fraction in the tag's offset counts.
 *
 * The size is the one it is used at, on the ART canvas in artboard 1d; the shape is read off the
 * foundations sheet, which specimens it larger than anything uses it. The design builds the mark
 * one bar per row rather than as one outline, and the path keeps that, so a row that is wrong
 * reads as a wrong row instead of hiding in a seam. `crispEdges` is load-bearing: the rendered
 * size is not a whole multiple of the grid.
 *
 * No stroke. At this size a stroke is a different silhouette, not the same one made legible.
 *
 * Position it from the parent (`left`/`top`, or a translate); the host smooths whatever moves, so
 * a cursor arriving over the network glides instead of teleporting. `[data-reduce-motion]` turns
 * that off along with every other transition.
 */
@Component({
  selector: 'nc-presence-flag',
  template: `
    <svg
      viewBox="0 0 10 15"
      width="16"
      height="24"
      shape-rendering="crispEdges"
      aria-hidden="true"
      class="block flex-none"
      [class]="text()"
    >
      <path
        fill="currentColor"
        d="M0 0H1V1H0ZM0 1H2V2H0ZM0 2H3V3H0ZM0 3H4V4H0ZM0 4H5V5H0ZM0 5H6V6H0ZM0 6H7V7H0ZM0 7H8V8H0ZM0 8H9V9H0ZM0 9H10V10H0ZM0 10H6V11H0ZM0 11H4V12H0ZM0 12H3V13H0ZM0 13H2V14H0ZM0 14H1V15H0Z"
      />
    </svg>
    <span
      class="mt-[calc(24px*9/15)] ml-px inline-block px-[5px] py-[2px] font-mono text-micro whitespace-nowrap uppercase tracking-tag text-on-accent"
      [class]="fill()"
    >
      {{ name() }}
    </span>
  `,
  host: {
    class:
      'pointer-events-none inline-flex items-start transition-[left,top,translate,opacity] duration-100 ease-out',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PresenceFlagComponent {
  readonly name = input.required<string>();
  readonly colour = input<PresenceColour>('sky');

  protected readonly text = computed(() => TEXT[this.colour()]);
  protected readonly fill = computed(() => FILL[this.colour()]);
}
