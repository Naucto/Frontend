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
 * Where a collaborator's pointer is, with their name hung at the row where the mark stops widening
 * — which is what the fraction in the tag's offset counts. The path keeps one bar per row of the
 * design's grid, so a wrong row reads as a wrong row. Position it from the parent (`left`/`top`, or
 * a translate); the host smooths whatever moves, and `[data-reduce-motion]` turns that off.
 */
@Component({
  selector: 'nc-presence-flag',
  templateUrl: './presence-flag.component.html',
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
