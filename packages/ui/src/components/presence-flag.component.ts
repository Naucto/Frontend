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
 * Collaborator cursor: pixel arrow with the name welded to its elbow.
 *
 * 16x24, measured off the cursors on the ART canvas in artboard 1d — the arrow keeps its 10x15
 * grid and is scaled whole, so every edge still lands on a device pixel. It used to render at that
 * grid's own size, which is why it read as a stray mark rather than as somebody's cursor.
 *
 * (Artboard 1a draws it at 32x48, but 1a is the foundations specimen sheet — a component shown at
 * a size nothing uses. Every real occurrence in the design is this one.)
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
        d="M0 0h1v1h1v1h1v1h1v1h1v1h1v1h1v1h1v1h1v1H6v1h1v1h1v1H7v-1H6v-1H5v-1H4v1H3v1H2v1H1v1H0z"
      />
    </svg>
    <span
      class="mt-[14px] ml-px inline-block px-[5px] py-[2px] font-mono text-micro whitespace-nowrap uppercase tracking-tag text-on-accent"
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
