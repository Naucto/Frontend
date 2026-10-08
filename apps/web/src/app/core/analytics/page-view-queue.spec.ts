import type { AnalyticsEventsResponseDto } from '@naucto/api-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TransientTransportError } from './analytics-transport';
import type { PageViewBatch, PageViewQueueDeps, QueuedPageView } from './page-view-queue';
import {
  FLUSH_AFTER_MS,
  MAX_BATCH_EVENTS,
  MAX_EVENT_AGE_MS,
  MAX_QUEUED,
  PageViewQueue,
  RETRY_DELAYS_MS,
} from './page-view-queue';

const OK: AnalyticsEventsResponseDto = {
  rotateVisitor: false,
  rotateSession: false,
  disabled: false,
  accepted: [],
  rejected: [],
};

const OWNER_A = { visitorId: 'visitor-a', sessionId: 'session-a' };
const OWNER_B = { visitorId: 'visitor-b', sessionId: 'session-b' };

describe('PageViewQueue', () => {
  let sent: { batch: PageViewBatch; keepalive: boolean }[];
  let reply: () => Promise<AnalyticsEventsResponseDto | null>;
  let online: boolean;
  let answered: ReturnType<typeof vi.fn<PageViewQueueDeps['answered']>>;
  let queue: PageViewQueue;
  let counter: number;

  const view = (owner = OWNER_A, capturedAt = Date.now()): QueuedPageView => {
    counter += 1;
    return { eventId: `event-${String(counter)}`, route: 'hub', capturedAt, owner };
  };

  const settle = async (ms = 0): Promise<void> => {
    await vi.advanceTimersByTimeAsync(ms);
  };

  beforeEach(() => {
    vi.useFakeTimers();
    sent = [];
    reply = async () => OK;
    online = true;
    counter = 0;
    answered = vi.fn<PageViewQueueDeps['answered']>();
    queue = new PageViewQueue({
      send: (batch, keepalive) => {
        sent.push({ batch, keepalive });
        return reply();
      },
      answered,
      online: () => online,
      now: () => Date.now(),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('waits ten seconds before sending a few views', async () => {
    queue.add(view());
    await settle(FLUSH_AFTER_MS - 1);
    expect(sent).toHaveLength(0);

    await settle(1);
    expect(sent).toHaveLength(1);
    expect(queue.size).toBe(0);
    expect(answered).toHaveBeenCalledWith(OWNER_A, OK);
  });

  it('sends at once when twenty views are waiting', async () => {
    for (let index = 0; index < 20; index += 1) {
      queue.add(view());
    }
    await settle();

    expect(sent).toHaveLength(1);
    expect(sent[0]?.batch.events).toHaveLength(20);
  });

  it('never mixes identities in one batch', async () => {
    queue.add(view(OWNER_A));
    queue.add(view(OWNER_B));
    queue.add(view(OWNER_A));
    await queue.flush();

    expect(sent.map(({ batch }) => [batch.owner, batch.events.length])).toEqual([
      [OWNER_A, 2],
      [OWNER_B, 1],
    ]);
  });

  it('caps a batch at fifty views', async () => {
    online = false;
    for (let index = 0; index < 60; index += 1) {
      queue.add(view());
    }
    online = true;
    await queue.flush();

    expect(sent.map(({ batch }) => batch.events.length)).toEqual([MAX_BATCH_EVENTS, 10]);
  });

  it('keeps the newest views when too many are waiting', () => {
    online = false;
    for (let index = 0; index < MAX_QUEUED + 5; index += 1) {
      queue.add(view());
    }

    expect(queue.size).toBe(MAX_QUEUED);
  });

  it('reports how old each view is when it leaves', async () => {
    queue.add(view(OWNER_A, Date.now() - 3_000));
    await queue.flush();

    expect(sent[0]?.batch.events[0]?.ageMs).toBe(3_000);
  });

  it('drops views the server would refuse as too old', async () => {
    queue.add(view(OWNER_A, Date.now() - MAX_EVENT_AGE_MS - 1));
    queue.add(view(OWNER_A));
    await queue.flush();

    expect(sent).toHaveLength(1);
    expect(sent[0]?.batch.events).toHaveLength(1);
  });

  it('retries after 2, 10 and 30 seconds, then gives up', async () => {
    reply = () => Promise.reject(new TransientTransportError('offline'));
    queue.add(view());
    await queue.flush();
    expect(sent).toHaveLength(1);

    for (const delay of RETRY_DELAYS_MS) {
      await settle(delay);
    }
    expect(sent).toHaveLength(4);
    expect(queue.size).toBe(0);
  });

  it('keeps the same event ids across retries, so the server stores them once', async () => {
    let failures = 1;
    reply = async () => {
      if (failures-- > 0) {
        throw new TransientTransportError('offline');
      }
      return OK;
    };
    queue.add(view());
    await queue.flush();
    await settle(RETRY_DELAYS_MS[0]);

    expect(sent.map(({ batch }) => batch.events[0]?.eventId)).toEqual(['event-1', 'event-1']);
    expect(queue.size).toBe(0);
  });

  it('drops a batch the server refused instead of retrying it', async () => {
    reply = async () => null;
    queue.add(view());
    await queue.flush();
    await settle(60_000);

    expect(sent).toHaveLength(1);
    expect(queue.size).toBe(0);
  });

  it('holds views while offline', async () => {
    online = false;
    queue.add(view());
    await settle(FLUSH_AFTER_MS);
    expect(sent).toHaveLength(0);

    online = true;
    await queue.flush();
    expect(sent).toHaveLength(1);
  });

  it('stops and forgets everything once the server says analytics is off', async () => {
    reply = async () => ({ ...OK, disabled: true });
    online = false;
    queue.add(view(OWNER_A));
    queue.add(view(OWNER_B));
    online = true;
    await queue.flush();

    expect(sent).toHaveLength(1);
    expect(queue.size).toBe(0);
  });

  it('hands what fits to the browser as the page goes away', () => {
    online = false;
    queue.add(view(OWNER_A));
    queue.add(view(OWNER_B));

    queue.flushOnExit(250);

    expect(sent.map(({ batch, keepalive }) => [batch.owner, keepalive])).toEqual([[OWNER_A, true]]);
    expect(queue.size).toBe(1);
  });
});
