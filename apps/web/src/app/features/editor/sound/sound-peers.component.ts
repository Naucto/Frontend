import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import type { PresenceColour } from '@naucto/ui';

import type { Collaborator } from '../work-session/session-presence.service';
import type { SoundWindow } from './sound.store';
import { SoundDeck } from './sound-deck';

const FRAME: Record<PresenceColour, string> = {
  sky: 'border-presence-sky',
  blush: 'border-presence-blush',
  jade: 'border-presence-jade',
};

const CHIP: Record<PresenceColour, string> = {
  sky: 'bg-presence-sky',
  blush: 'bg-presence-blush',
  jade: 'bg-presence-jade',
};

@Component({
  selector: 'nc-sound-peers',
  templateUrl: './sound-peers.component.html',
  host: { class: 'pointer-events-none absolute inset-0 z-30' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SoundPeersComponent {
  readonly window = input.required<SoundWindow>();
  private readonly deck = inject(SoundDeck);
  private readonly transloco = inject(TranslocoService);
  protected readonly here = computed(() => this.deck.peers().get(this.window()) ?? []);
  protected readonly frame = computed(() => {
    const first = this.here()[0];
    return first ? FRAME[first.colour] : '';
  });

  protected placeOf(peer: Collaborator): string {
    const view = peer.view;
    const [kind, key] = view?.pane === this.window() ? (view.item ?? '').split(/:(.*)/) : [];
    if (!kind || key === undefined) {
      return '';
    }
    return kind === 'instrument'
      ? (this.deck.library.instruments().get(key)?.name ?? '')
      : this.transloco.translate(`editor.sound.peerOn.${kind}`, { n: key.padStart(2, '0') });
  }

  protected chip(colour: PresenceColour): string {
    return CHIP[colour];
  }
}
