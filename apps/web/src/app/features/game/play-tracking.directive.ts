import { DestroyRef, Directive, effect, inject, input, untracked } from '@angular/core';

import { ActivityService } from '../../core/analytics/activity.service';
import { PlayReporter } from '../../core/analytics/play-reporter';
import { PlayTracker } from '../../core/analytics/play-tracker';
import { RuntimeHostService } from '../../shared/game-screen/runtime-host.service';

/**
 * Reports the plays of the game on this screen: each start, its running time and its end, and one
 * view of the game the first time it is played here.
 */
@Directive({ selector: 'nc-game-screen[ncPlayTracking]' })
export class PlayTrackingDirective {
  readonly releaseId = input.required<number>({ alias: 'ncPlayTracking' });

  private readonly reporter = inject(PlayReporter);
  private readonly activity = inject(ActivityService);

  constructor() {
    let releasePlaying: (() => void) | null = null;
    let viewed: number | null = null;
    const tracker = new PlayTracker(() => Date.now(), {
      started: (clock) => {
        const releaseId = untracked(() => this.releaseId());
        this.reporter.begin(releaseId, clock);
        releasePlaying = this.activity.claim({ state: 'PLAYING', releaseId });
        if (viewed !== releaseId) {
          viewed = releaseId;
          this.reporter.registerView(releaseId);
        }
      },
      ended: (reason) => {
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
