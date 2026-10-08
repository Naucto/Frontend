import { DestroyRef, effect, inject, Injectable, untracked } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import type { AnalyticsContextDto, AnalyticsEventsResponseDto } from '@naucto/api-client';

import { FeaturesService } from '../config/features.service';
import { AnalyticsTransport, applyRotation, KEEPALIVE_BUDGET_BYTES } from './analytics-transport';
import { BrowserAccountService } from './browser-account.service';
import { ConsentStore } from './consent.store';
import { landingContext } from './landing-context';
import type { PageViewBatch } from './page-view-queue';
import { PageViewQueue } from './page-view-queue';
import { randomId } from './random-id';
import { pagePath, routeKey } from './route-key';
import { ensureVisitorId, touchSession } from './visitor';

/**
 * Counts page views of browsers that agreed to it. A view is a finished navigation to a new path;
 * query and fragment changes are the same page.
 */
@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly router = inject(Router);
  private readonly consent = inject(ConsentStore);
  private readonly features = inject(FeaturesService);
  private readonly account = inject(BrowserAccountService);
  private readonly transport = inject(AnalyticsTransport);

  /** Sent until a batch is taken: the server keeps where a session came from when it opens one. */
  private landing: AnalyticsContextDto | null = landingContext({
    referrer: document.referrer,
    search: location.search,
  });
  private lastPath: string | null = null;
  private readonly queue = new PageViewQueue({
    send: (batch, keepalive) => this.send(batch, keepalive),
    answered: (owner, answer) => {
      this.answered(owner, answer);
    },
    online: () => navigator.onLine,
    now: () => Date.now(),
  });

  constructor() {
    const navigations = this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.capture();
      }
    });

    effect(() => {
      const collecting = this.collecting();
      untracked(() => {
        if (collecting) {
          this.capture();
        } else {
          this.queue.clear();
          this.lastPath = null;
        }
      });
    });

    const onHidden = (): void => {
      if (document.visibilityState === 'hidden') {
        void this.queue.flush();
      }
    };
    const onExit = (): void => {
      this.queue.flushOnExit(KEEPALIVE_BUDGET_BYTES);
    };
    const onOnline = (): void => {
      void this.queue.flush();
    };
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('pagehide', onExit);
    window.addEventListener('online', onOnline);
    inject(DestroyRef).onDestroy(() => {
      navigations.unsubscribe();
      this.queue.clear();
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('pagehide', onExit);
      window.removeEventListener('online', onOnline);
    });
  }

  /** Whether this tab reports under the browser's visitor right now. */
  collecting(): boolean {
    return (
      this.features.analytics() && this.consent.status() === 'granted' && !this.account.suspended()
    );
  }

  private capture(): void {
    if (!this.router.navigated || !untracked(() => this.collecting())) {
      return;
    }
    const path = pagePath(this.router.url);
    const route = routeKey(this.router.routerState.snapshot.root);
    if (route === null || path === this.lastPath) {
      return;
    }
    this.lastPath = path;
    const owner = { visitorId: ensureVisitorId(), sessionId: touchSession() };
    this.queue.add({ eventId: randomId(), route, capturedAt: Date.now(), owner });
  }

  private async send(
    batch: PageViewBatch,
    keepalive: boolean,
  ): Promise<AnalyticsEventsResponseDto | null> {
    const answer = await this.transport.post<AnalyticsEventsResponseDto>(
      '/analytics/events',
      {
        ...batch.owner,
        context: { ...this.landing, viewportWidth: Math.round(window.innerWidth) || undefined },
        events: batch.events,
      },
      { keepalive },
    );
    if (answer) {
      this.landing = null;
    }
    return answer;
  }

  private answered(owner: PageViewBatch['owner'], answer: AnalyticsEventsResponseDto): void {
    applyRotation(owner, answer);
    if (answer.disabled) {
      this.features.disableAnalytics();
    }
  }
}
