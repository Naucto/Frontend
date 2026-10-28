import { DestroyRef, Directive, effect, inject, input, untracked } from '@angular/core';

import { ActivityService } from '../../core/analytics/activity.service';
import { PlayReporter } from '../../core/analytics/play-reporter';
import { type PlayClock, PlayTracker } from '../../core/analytics/play-tracker';
import { FeedbackStore } from '../../shared/feedback/feedback.store';
import { RuntimeHostService } from '../../shared/game-screen/runtime-host.service';
import { registerView } from '../../shared/queries/releases.queries';

/**
 * Reports the plays of the game on this screen: each start, its running time and its end, and one
 * view of the game the first time it is played here.
 */
@Directive({ selector: 'nc-game-screen[ncPlayTracking]' })
export class PlayTrackingDirective {
  readonly releaseId = input.required<number>({ alias: 'ncPlayTracking' });

  private readonly reporter = inject(PlayReporter);
  private readonly activity = inject(ActivityService);
  private readonly feedback = inject(FeedbackStore);

  constructor() {
    let releasePlaying: (() => void) | null = null;
    let viewed: number | null = null;
    let playing: { releaseId: number; clock: PlayClock } | null = null;
    const tracker = new PlayTracker(() => Date.now(), {
      started: (clock) => {
        const releaseId = untracked(() => this.releaseId());
        playing = { releaseId, clock };
        this.reporter.begin(releaseId, clock);
        releasePlaying = this.activity.claim({ state: 'PLAYING', releaseId });
        if (viewed !== releaseId) {
          viewed = releaseId;
          registerView(releaseId);
        }
      },
      ended: (reason) => {
        if (playing) {
          this.feedback.notePlayEnded(playing.releaseId, playing.clock.activeMs);
          playing = null;
        }
        this.reporter.end(reason);
        releasePlaying?.();
        releasePlaying = null;
      },
    });
    const unlisten = inject(RuntimeHostService).onStateChange((state) => {
      tracker.onState(state);
    });
    effect(() => {
      this.releaseId();
      untracked(() => {
        tracker.end('release-change');
      });
    });
    const onPageHide = (): void => {
      this.reporter.exit();
    };
    const onPageShow = (event: PageTransitionEvent): void => {
      if (event.persisted) {
        this.reporter.sync();
      }
    };
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('pageshow', onPageShow);
    inject(DestroyRef).onDestroy(() => {
      unlisten();
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('pageshow', onPageShow);
      tracker.end('leave');
    });
  }
}
