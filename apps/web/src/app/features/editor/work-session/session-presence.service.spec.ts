import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { Awareness } from 'y-protocols/awareness';
import * as Y from 'yjs';

import { AuthStore } from '../../../core/auth/auth.store';
import { SessionPresenceService } from './session-presence.service';

describe('SessionPresenceService views', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('shares the view it was given before and after connecting, and finds peers by it', () => {
    TestBed.configureTestingModule({
      providers: [
        SessionPresenceService,
        { provide: AuthStore, useValue: { userId: () => 1, displayName: () => 'me' } },
      ],
    });
    const presence = TestBed.inject(SessionPresenceService);
    const doc = new Y.Doc();
    const mine = new Awareness(doc);
    presence.setView({ tab: 'art' });
    presence.connect(mine);
    expect(mine.getLocalState()).toMatchObject({ view: { tab: 'art' } });

    presence.setView({ tab: 'sound', pane: 'timeline' });
    expect(mine.getLocalState()).toMatchObject({ view: { tab: 'sound', pane: 'timeline' } });

    presence.setView({ tab: 'sound', pane: 'timeline', item: 'song:2' });
    expect(mine.getLocalState()).toMatchObject({ view: { item: 'song:2' } });

    const peerDoc = new Y.Doc();
    const theirs = new Awareness(peerDoc);
    theirs.setLocalState({ userId: 2, name: 'Louis', view: { tab: 'sound', pane: 'sfx' } });
    const states = mine.getStates();
    const peer = theirs.getLocalState();
    if (peer) {
      states.set(theirs.clientID, peer);
    }
    presence.refresh([]);

    expect(presence.peersIn('sound').map((each) => each.name)).toEqual(['Louis']);
    expect(presence.peersIn('sound', 'sfx').map((each) => each.name)).toEqual(['Louis']);
    expect(presence.peersIn('sound', 'timeline')).toEqual([]);
    expect(presence.peersIn('art')).toEqual([]);
  });

  it('sends a selection only when it changes, never with the pointer', () => {
    TestBed.configureTestingModule({
      providers: [
        SessionPresenceService,
        { provide: AuthStore, useValue: { userId: () => 1, displayName: () => 'me' } },
      ],
    });
    const presence = TestBed.inject(SessionPresenceService);
    const mine = new Awareness(new Y.Doc());
    presence.connect(mine);
    let updates = 0;
    mine.on('change', () => {
      updates += 1;
    });

    presence.setSelection({ tab: 'sound:timeline', scope: '0', items: ['b1', 'b2'] });
    presence.setSelection({ tab: 'sound:timeline', scope: '0', items: ['b1', 'b2'] });
    expect(updates).toBe(1);

    presence.setCursor({ tab: 'sound:timeline', scope: '0', x: 1, y: 2 });
    expect(mine.getLocalState()?.cursor).toEqual({
      tab: 'sound:timeline',
      scope: '0',
      x: 1,
      y: 2,
    });

    presence.setSelection({ tab: 'sound:timeline', scope: '0', items: [] });
    expect(mine.getLocalState()?.selection).toBeUndefined();
  });
});
