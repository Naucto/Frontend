import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { NotificationsStore } from '../notifications/notifications.store';
import { PresenceStore } from './presence.store';

/**
 * The server reads a client message's fields off the top level and closes the socket on anything
 * it cannot validate — `auth` carries `token`, not `payload.token`. Wrapping presence in a
 * `payload`, which is what the *server's* own messages look like, meant every announcement killed
 * the connection: nobody has ever appeared as playing or hosting to a friend, and the only symptom
 * was a socket that kept reconnecting.
 *
 * So this pins the wire shape, not the behaviour around it.
 */
describe('PresenceStore announcements', () => {
  const sent: unknown[] = [];

  beforeEach(() => {
    sent.length = 0;
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
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
    TestBed.inject(PresenceStore).announce({ kind: 'HOSTING', projectId: 13, sessionId: 'abc' });

    expect(sent).toEqual([
      { type: 'presence:set', kind: 'HOSTING', projectId: 13, sessionId: 'abc' },
    ]);
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
