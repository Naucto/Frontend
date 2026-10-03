import { TestBed } from '@angular/core/testing';
import { type PresenceDto } from '@naucto/api-client';
import { QueryClient } from '@tanstack/angular-query-experimental';
import { beforeEach, describe, expect, it } from 'vitest';

import { NotificationsStore } from '../notifications/notifications.store';
import { PresenceStore } from './presence.store';

/**
 * A client frame carries its fields on the top level, which is where the server reads them, and
 * the server closes the socket on anything it cannot validate.
 */
describe('PresenceStore announcements', () => {
  const sent: unknown[] = [];

  beforeEach(() => {
    sent.length = 0;
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: QueryClient, useValue: new QueryClient() },
        {
          provide: NotificationsStore,
          useValue: {
            send: (msg: unknown) => {
              sent.push(msg);
              return true;
            },
            onMessage: () => () => undefined,
          },
        },
      ],
    });
  });

  it('puts the presence fields at the top level, not under payload', () => {
    TestBed.inject(PresenceStore).announce({ kind: 'HOSTING', projectId: 13 });

    expect(sent).toEqual([{ type: 'presence:set', kind: 'HOSTING', projectId: 13 }]);
    expect(sent[0]).not.toHaveProperty('payload');
  });

  it('restates the last announcement the same way when the socket re-authenticates', () => {
    const store = TestBed.inject(PresenceStore);
    store.announce({ kind: 'PLAYING', releaseId: 6 });
    sent.length = 0;

    store.handle({ type: 'notifications:init', payload: [] });

    expect(sent).toEqual([{ type: 'presence:set', kind: 'PLAYING', releaseId: 6 }]);
  });
});

describe('PresenceStore live state', () => {
  const at = (userId: number, kind: 'PLAYING' | 'IDLE' = 'PLAYING'): PresenceDto => ({
    userId,
    username: `user${String(userId)}`,
    nickname: null,
    kind,
    releaseId: null,
    projectId: null,
    sessionId: null,
    title: null,
    coverUrl: null,
    players: null,
    maxPlayers: null,
    joinable: false,
    since: '2026-10-01T00:00:00Z',
  });

  const store = (): InstanceType<typeof PresenceStore> => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: QueryClient, useValue: new QueryClient() },
        {
          provide: NotificationsStore,
          useValue: { send: () => true, onMessage: () => () => undefined },
        },
      ],
    });
    return TestBed.inject(PresenceStore);
  };

  it('forgets a friend the latest snapshot leaves out', () => {
    const presenceStore = store();
    presenceStore.handle({ type: 'presence:snapshot', payload: [at(1), at(2)] });

    presenceStore.handle({ type: 'presence:snapshot', payload: [at(1)] });

    expect(presenceStore.of(1)?.kind).toBe('PLAYING');
    expect(presenceStore.of(2)).toBeNull();
  });

  it('applies a change and an offline frame to the one friend they name', () => {
    const presenceStore = store();
    presenceStore.handle({ type: 'presence:snapshot', payload: [at(1), at(2)] });

    presenceStore.handle({ type: 'presence:changed', payload: at(1, 'IDLE') });
    presenceStore.handle({ type: 'presence:offline', payload: { userId: 2 } });

    expect(presenceStore.of(1)?.kind).toBe('IDLE');
    expect(presenceStore.of(2)).toBeNull();
  });
});
