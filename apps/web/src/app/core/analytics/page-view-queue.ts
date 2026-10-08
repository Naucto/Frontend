import type { AnalyticsEventsResponseDto, AnalyticsPageViewDto } from '@naucto/api-client';

import { TransientTransportError } from './analytics-transport';
import type { AnalyticsIdentity } from './visitor';

export const MAX_BATCH_EVENTS = 50;
export const MAX_BATCH_BYTES = 16 * 1024;
export const FLUSH_AT_EVENTS = 20;
export const FLUSH_AFTER_MS = 10_000;
export const MAX_QUEUED = 200;
export const RETRY_DELAYS_MS = [2_000, 10_000, 30_000] as const;
/** The server refuses older page views, so they are not worth the bytes. */
export const MAX_EVENT_AGE_MS = 15 * 60 * 1000;

export interface QueuedPageView {
  eventId: string;
  route: string;
  capturedAt: number;
  owner: AnalyticsIdentity;
}

export interface PageViewBatch {
  owner: AnalyticsIdentity;
  events: AnalyticsPageViewDto[];
}

export interface PageViewQueueDeps {
  send(batch: PageViewBatch, keepalive: boolean): Promise<AnalyticsEventsResponseDto | null>;
  answered(owner: AnalyticsIdentity, answer: AnalyticsEventsResponseDto): void;
  online(): boolean;
  now(): number;
}

/**
 * Page views waiting to be sent, each stamped with the identity it was captured under. A batch
 * holds one identity only, so a view can never be reported under a visitor that came later.
 */
export class PageViewQueue {
  private queue: QueuedPageView[] = [];
  private attempts = 0;
  private sending = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly deps: PageViewQueueDeps) {}

  get size(): number {
    return this.queue.length;
  }

  add(view: QueuedPageView): void {
    this.queue.push(view);
    if (this.queue.length > MAX_QUEUED) {
      this.queue.splice(0, this.queue.length - MAX_QUEUED);
    }
    if (this.queue.length >= FLUSH_AT_EVENTS) {
      void this.flush();
    } else if (this.timer === null && this.attempts === 0) {
      this.schedule(FLUSH_AFTER_MS);
    }
  }

  /** Sends everything queued, one identity at a time, until it is empty or a send fails. */
  async flush(): Promise<void> {
    if (this.sending || !this.deps.online()) {
      return;
    }
    this.cancelTimer();
    this.sending = true;
    try {
      while (this.queue.length > 0) {
        const batch = this.nextBatch();
        if (!batch) {
          continue;
        }
        if (!(await this.sendBatch(batch, false))) {
          return;
        }
      }
    } finally {
      this.sending = false;
    }
  }

  /** As the page goes away: hand what fits to the browser, which may finish it after the page. */
  flushOnExit(budgetBytes: number): void {
    this.cancelTimer();
    let spent = 0;
    while (this.queue.length > 0) {
      const batch = this.nextBatch();
      if (!batch) {
        continue;
      }
      spent += JSON.stringify(batch).length;
      if (spent > budgetBytes) {
        return;
      }
      void this.deps.send(batch, true).catch(() => undefined);
      this.remove(batch);
    }
  }

  clear(): void {
    this.cancelTimer();
    this.queue = [];
    this.attempts = 0;
  }

  private async sendBatch(batch: PageViewBatch, keepalive: boolean): Promise<boolean> {
    let answer: AnalyticsEventsResponseDto | null;
    try {
      answer = await this.deps.send(batch, keepalive);
    } catch (error) {
      if (!(error instanceof TransientTransportError)) {
        throw error;
      }
      this.retryLater(batch);
      return false;
    }
    this.attempts = 0;
    this.remove(batch);
    if (answer) {
      this.deps.answered(batch.owner, answer);
      if (answer.disabled) {
        this.clear();
      }
    }
    return true;
  }

  private retryLater(batch: PageViewBatch): void {
    const delay = RETRY_DELAYS_MS[this.attempts];
    if (delay === undefined) {
      this.attempts = 0;
      this.remove(batch);
      if (this.queue.length > 0) {
        this.schedule(FLUSH_AFTER_MS);
      }
      return;
    }
    this.attempts += 1;
    this.schedule(delay);
  }

  /** The oldest identity's views, within the batch limits; null when they were all too old. */
  private nextBatch(): PageViewBatch | null {
    const now = this.deps.now();
    const fresh = this.queue.filter((view) => now - view.capturedAt <= MAX_EVENT_AGE_MS);
    if (fresh.length < this.queue.length) {
      this.queue = fresh;
      return null;
    }
    const [first] = this.queue;
    if (!first) {
      return null;
    }
    const owner = first.owner;
    const batch: PageViewBatch = { owner, events: [] };
    let bytes = JSON.stringify(batch).length;
    for (const view of this.queue) {
      if (view.owner.visitorId !== owner.visitorId || view.owner.sessionId !== owner.sessionId) {
        continue;
      }
      const event: AnalyticsPageViewDto = {
        eventId: view.eventId,
        type: 'PAGE_VIEW',
        ageMs: Math.max(0, now - view.capturedAt),
        route: view.route,
      };
      bytes += JSON.stringify(event).length + 1;
      if (batch.events.length === MAX_BATCH_EVENTS || bytes > MAX_BATCH_BYTES) {
        break;
      }
      batch.events.push(event);
    }
    return batch;
  }

  private remove(batch: PageViewBatch): void {
    const sent = new Set(batch.events.map((event) => event.eventId));
    this.queue = this.queue.filter((view) => !sent.has(view.eventId));
  }

  private schedule(delayMs: number): void {
    this.cancelTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, delayMs);
  }

  private cancelTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
