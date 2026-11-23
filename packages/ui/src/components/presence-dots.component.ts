import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { type PresenceColour } from './avatar.component';

export interface PresenceDot {
  id: number;
  name: string;
  colour: PresenceColour;
}

const FILL: Record<PresenceColour, string> = {
  sky: 'bg-presence-sky',
  blush: 'bg-presence-blush',
  jade: 'bg-presence-jade',
};

const SHOWN = 3;

@Component({
  selector: 'nc-presence-dots',
  templateUrl: './presence-dots.component.html',
  host: { class: 'inline-flex items-center gap-[3px]' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PresenceDotsComponent {
  readonly peers = input<readonly PresenceDot[]>([]);
  protected readonly shown = computed(() => this.peers().slice(0, SHOWN));
  protected readonly more = computed(() => Math.max(0, this.peers().length - SHOWN));
  protected readonly names = computed(() =>
    this.peers()
      .map((peer) => peer.name)
      .join(', '),
  );

  protected fill(colour: PresenceColour): string {
    return FILL[colour];
  }
}
