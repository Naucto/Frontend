import { DestroyRef, effect, inject, Injectable, untracked } from '@angular/core';
import type { AnalyticsRotationDto } from '@naucto/api-client';

import { AuthStore } from '../auth/auth.store';
import { FeaturesService } from '../config/features.service';
import { ActivityService } from './activity.service';
import { type AnalyticsMode, AnalyticsModeService } from './analytics-mode.service';
import { AnalyticsTransport, applyRotation } from './analytics-transport';
import { PlayReporter } from './play-reporter';
import { ensureVisitorId, touchSession } from './visitor';

export const CONSENTED_BEAT_MS = 45_000;
export const ANONYMOUS_BEAT_MS = 60_000;

/**
 * Tells the server this tab is open and what it is doing, while it is visible. A browser that
 * agreed beats under its visitor; any other tab sends a ping that carries no identifier at all.
 * Beats are never retried: a lost one only lowers a count by a minute.
 */
@Injectable({ providedIn: 'root' })
export class HeartbeatService {
  private readonly features = inject(FeaturesService);
  private readonly auth = inject(AuthStore);
  private readonly activity = inject(ActivityService);
  private readonly transport = inject(AnalyticsTransport);
  private readonly plays = inject(PlayReporter);
  private readonly mode = inject(AnalyticsModeService).mode;

  private timer: ReturnType<typeof setInterval> | null = null;
  private lastBeatAt = Number.NEGATIVE_INFINITY;

  constructor() {
    effect(() => {
      const mode = this.mode();
      untracked(() => {
        this.restart(mode);
      });
    });
    const onVisibility = (): void => {
      this.restart(untracked(() => this.mode()));
    };
    document.addEventListener('visibilitychange', onVisibility);
    inject(DestroyRef).onDestroy(() => {
      document.removeEventListener('visibilitychange', onVisibility);
      this.stop();
    });
  }

  private restart(mode: AnalyticsMode): void {
    this.stop();
    if (mode === 'off' || document.visibilityState !== 'visible') {
      return;
    }
    const interval = mode === 'consented' ? CONSENTED_BEAT_MS : ANONYMOUS_BEAT_MS;
    if (Date.now() - this.lastBeatAt >= interval) {
      this.beat(mode);
    }
    this.timer = setInterval(() => {
      this.beat(mode);
    }, interval);
  }

  private stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private beat(mode: Exclude<AnalyticsMode, 'off'>): void {
    this.lastBeatAt = Date.now();
    this.plays.sync();
    const { state, releaseId } = this.activity.current();
    if (mode === 'anonymous') {
      void this.transport
        .post('/analytics/ping', {
          kind: 'BEAT',
          state,
          signedIn: this.auth.isAuthenticated(),
          releaseId,
          playMs: this.plays.takeAnonymousMs(),
        })
        .catch(() => undefined);
      return;
    }
    const sent = { visitorId: ensureVisitorId(), sessionId: touchSession() };
    const play = this.plays.consentedReport(sent);
    void this.transport
      .post<AnalyticsRotationDto>('/analytics/beat', { ...sent, state, releaseId, play })
      .then((answer) => {
        if (!answer) {
          return;
        }
        applyRotation(sent, answer);
        if (answer.disabled) {
          this.features.disableAnalytics();
        } else if (play && !answer.rotateVisitor && !answer.rotateSession) {
          this.plays.acknowledged(play);
        }
      })
      .catch(() => undefined);
  }
}
