import { TestBed } from '@angular/core/testing';
import { uuidOf } from '@naucto/api-client/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { Awareness } from 'y-protocols/awareness';
import * as Y from 'yjs';

import { AuthStore } from '../../../core/auth/auth.store';
import { type AwarenessState, SessionPresenceService } from './session-presence.service';

/** Three accounts whose ids sort in this order, whatever order they joined the room in. */
const [FIRST, SECOND, THIRD] = [
  '0a000000-0000-4000-8000-000000000000',
  '9f000000-0000-4000-8000-000000000000',
  'f1000000-0000-4000-8000-000000000000',
];

describe('SessionPresenceService', () => {
  /** The service of one client of a room, signed in as `me`, with the others' states in it. */
  const client = (
    me: string,
    others: [clientId: number, state: AwarenessState][],
  ): { presence: SessionPresenceService; awareness: Awareness } => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        SessionPresenceService,
        { provide: AuthStore, useValue: { userId: () => me, displayName: () => `name of ${me}` } },
      ],
    });
    const awareness = new Awareness(new Y.Doc());
    for (const [clientId, state] of others) {
      awareness.states.set(clientId, state);
    }
    const presence = TestBed.inject(SessionPresenceService);
    presence.connect(awareness);
    return { presence, awareness };
  };
  const seen = (presence: SessionPresenceService): [string, string][] =>
    presence.collaborators().map(({ userId, colour }) => [userId, colour]);

  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('gives every client of a room the same order and the same colours, whoever joined first', () => {
    const asThird = client(THIRD, [
      [11, { userId: SECOND, name: 'lea' }],
      [12, { userId: FIRST, name: 'louis' }],
    ]);
    const order = seen(asThird.presence);
    const asFirst = client(FIRST, [
      [21, { userId: THIRD, name: 'thea' }],
      [22, { userId: SECOND, name: 'lea' }],
    ]);

    expect(order).toEqual([
      [FIRST, 'sky'],
      [SECOND, 'blush'],
      [THIRD, 'jade'],
    ]);
    expect(seen(asFirst.presence)).toEqual(order);
    expect(asFirst.presence.myColour()).toBe('sky');
  });

  it('tells this client apart by its connection, and names the others as they named themselves', () => {
    const { presence, awareness } = client(SECOND, [[11, { userId: FIRST, name: 'louis' }]]);

    expect(presence.collaborators()).toEqual([
      { clientId: 11, userId: FIRST, name: 'louis', colour: 'sky', isSelf: false },
      expect.objectContaining({ clientId: awareness.clientID, userId: SECOND, isSelf: true }),
    ]);
    expect(presence.peerCount()).toBe(2);
    expect(presence.isPresent(FIRST)).toBe(true);
    expect(presence.isPresent(THIRD)).toBe(false);
  });

  it('leaves out a client that names no account', () => {
    const { presence } = client(FIRST, [
      [11, { name: 'nobody' }],
      [12, { userId: 12 as unknown as string, name: 'a number is no account' }],
    ]);

    expect(seen(presence)).toEqual([[FIRST, 'sky']]);
  });

  it('gives two tabs of one account one colour, the lower connection first', () => {
    const { presence } = client(SECOND, [
      [5, { userId: FIRST, name: 'louis' }],
      [3, { userId: FIRST, name: 'louis' }],
    ]);

    expect(presence.collaborators().map(({ clientId, colour }) => [clientId, colour])).toEqual([
      [3, 'sky'],
      [5, 'sky'],
      [expect.any(Number), 'blush'],
    ]);
  });

  it('shares the number this client plays under at the game table, and that it left it', () => {
    const { presence, awareness } = client(FIRST, [
      [11, { userId: SECOND, name: 'lea', player: 2007 }],
    ]);
    expect((awareness.getLocalState() as AwarenessState).player).toBeUndefined();

    presence.setPlayer(1042);
    expect(awareness.getLocalState()).toMatchObject({ userId: FIRST, player: 1042 });
    presence.refresh([]);
    expect(presence.collaborators().map(({ userId, player }) => [userId, player])).toEqual([
      [FIRST, 1042],
      [SECOND, 2007],
    ]);

    presence.setPlayer(null);
    expect((awareness.getLocalState() as AwarenessState).player).toBeUndefined();
  });

  it('enters the room already saying where this client plays, when its game was at the table first', () => {
    TestBed.configureTestingModule({
      providers: [
        SessionPresenceService,
        { provide: AuthStore, useValue: { userId: () => uuidOf(1), displayName: () => 'alexis' } },
      ],
    });
    const presence = TestBed.inject(SessionPresenceService);
    presence.setPlayer(1042);
    const awareness = new Awareness(new Y.Doc());

    presence.connect(awareness);

    expect(awareness.getLocalState()).toEqual({ userId: uuidOf(1), player: 1042, name: 'alexis' });
  });

  it('says who left by what they last shared', () => {
    const { presence, awareness } = client(FIRST, [[11, { userId: SECOND, name: 'lea' }]]);
    awareness.states.delete(11);

    expect(presence.refresh([11])).toEqual([{ userId: SECOND, name: 'lea' }]);
    expect(seen(presence)).toEqual([[FIRST, 'sky']]);
    expect(presence.refresh([11])).toEqual([]);
  });
});
