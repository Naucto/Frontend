import { computed, Injectable, signal } from '@angular/core';
import type { AnalyticsLiveState } from '@naucto/api-client';

export interface Activity {
  state: AnalyticsLiveState;
  /** The published game involved, if any. */
  releaseId?: number;
}

const RANK: Record<AnalyticsLiveState, number> = {
  BROWSING: 0,
  BUILDING: 1,
  PLAYING: 2,
  HOSTING: 3,
};

const BROWSING: Activity = { state: 'BROWSING' };

/**
 * What this tab is doing, as its heartbeat reports it. Each part of the app claims what it is doing
 * while it does it, and the tab reports the highest claim.
 */
@Injectable({ providedIn: 'root' })
export class ActivityService {
  private readonly claims = signal<readonly { activity: Activity }[]>([]);

  readonly current = computed<Activity>(() =>
    this.claims().reduce<Activity>(
      (best, { activity }) => (RANK[activity.state] > RANK[best.state] ? activity : best),
      BROWSING,
    ),
  );

  /** Claims an activity until the returned release is called. Releasing twice is harmless. */
  claim(activity: Activity): () => void {
    const entry = { activity };
    this.claims.update((claims) => [...claims, entry]);
    return () => {
      this.claims.update((claims) => claims.filter((claim) => claim !== entry));
    };
  }
}
