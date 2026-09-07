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
 * Where a collaborator's pointer is, with their name hung at the row where the mark stops widening —
 * which is what the fraction in the tag's offset counts.
 *
 * The shape is read off the foundations sheet, one bar per row, and the path keeps that division so
 * a row that is wrong reads as a wrong row instead of hiding in a seam. The left edge is a diagonal,
 * not a straight side: that is what makes it a kite rather than a flag on a staff, and it is what
 * the design was redrawn to say — a presence mark is not the system pointer.
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
      viewBox="0 0 12 12"
      width="16"
      height="16"
      shape-rendering="crispEdges"
      aria-hidden="true"
      class="block flex-none"
      [class]="text()"
    >
      <path
        fill="currentColor"
        d="M0 0H2V1H0ZM0 1H5V2H0ZM1 2H7V3H1ZM1 3H10V4H1ZM1 4H12V5H1ZM2 5H10V6H2ZM2 6H9V7H2ZM3 7H8V8H3ZM3 8H7V9H3ZM3 9H6V10H3ZM4 10H5V11H4ZM4 11H5V12H4Z"
      />
    </svg>
    <span
      class="mt-[calc(16px*5/12)] ml-px inline-block px-[5px] py-[2px] font-mono text-micro whitespace-nowrap uppercase tracking-tag text-on-accent"
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
