import { TestBed } from '@angular/core/testing';
import { client } from '@naucto/api-client';
import { uuidOf } from '@naucto/api-client/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthStore } from '../../../core/auth/auth.store';
import { HostElectionService } from './host-election.service';
import { SessionPresenceService } from './session-presence.service';

const realFetch = globalThis.fetch;
const GAME = uuidOf(7);
const [ME, HOST, OTHER] = [uuidOf(1), uuidOf(2), uuidOf(3)];

/**
 * The server elects: among the accounts present it keeps the recorded host, or takes the one
 * whose id sorts first. A client never orders ids to guess the answer; it says who left and asks.
 */
describe('HostElectionService', () => {
  /** Who the server believes is in the session and hosts it, and how it elects when the host goes. */
  let server: { hostId: string; users: string[]; elect: (users: string[]) => string | undefined };
  let kicked: string[];
  let peers: number;
  let election: HostElectionService;
  const promoted = vi.fn();

  beforeEach(() => {
    server = { hostId: HOST, users: [ME, HOST, OTHER], elect: (users) => [...users].sort()[0] };
    kicked = [];
    peers = 3;
    promoted.mockClear();
    client.setConfig({ baseUrl: 'https://api.test', throwOnError: false });
    globalThis.fetch = async (input: RequestInfo | URL): Promise<Response> => {
      const request = input instanceof Request ? input : new Request(input);
      const { pathname } = new URL(request.url);
      if (pathname === `/work-sessions/kick/${GAME}`) {
        const { userId } = (await request.json()) as { userId: string };
        kicked.push(userId);
        server.users = server.users.filter((user) => user !== userId);
        if (server.hostId === userId) {
          server.hostId = server.elect(server.users) ?? userId;
        }
        return Response.json({});
      }
      if (pathname === `/work-sessions/info/${GAME}`) {
        return Response.json({
          hostId: server.hostId,
          users: server.users,
          project: GAME,
          startedAt: '',
        });
      }
      return Response.json({ message: 'unexpected' }, { status: 500 });
    };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        HostElectionService,
        { provide: AuthStore, useValue: { userId: () => ME } },
        {
          provide: SessionPresenceService,
          useValue: { peerCount: () => peers, isPresent: () => false },
        },
      ],
    });
    election = TestBed.inject(HostElectionService);
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('hosts when the server named this account at join, and not when it named another', () => {
    election.start(GAME, ME, promoted);
    expect(election.isHost()).toBe(true);

    election.start(GAME, HOST, promoted);
    expect(election.isHost()).toBe(false);
  });

  it('tells the server the host left, and takes over when the server names this account', async () => {
    election.start(GAME, HOST, promoted);

    await election.onPeersLeft([{ userId: HOST, name: 'louis' }]);

    // Told once as a guest and once more as the new host: nobody else is taken out.
    expect([...new Set(kicked)]).toEqual([HOST]);
    expect(election.isHost()).toBe(true);
    expect(promoted).toHaveBeenCalledTimes(1);
  });

  it('stays a guest when the server names another account, whatever the ids look like', async () => {
    // The server's choice is its own: here it is not the id a client would sort first.
    server.elect = () => OTHER;
    election.start(GAME, HOST, promoted);

    await election.onPeersLeft([{ userId: HOST, name: 'louis' }]);

    expect(kicked).toEqual([HOST]);
    expect(election.isHost()).toBe(false);
    expect(promoted).not.toHaveBeenCalled();
  });

  it('leaves a guest who is gone to the host: a guest that is not host kicks nobody else', async () => {
    election.start(GAME, HOST, promoted);

    await election.onPeersLeft([{ userId: OTHER, name: 'thea' }]);

    expect(kicked).toEqual([]);
    expect(election.isHost()).toBe(false);
  });

  it('as host, takes out of the session every account that left, and nothing that named none', async () => {
    election.start(GAME, ME, promoted);

    await election.onPeersLeft([
      { userId: HOST, name: 'louis' },
      { name: 'a client that named no account' },
      { userId: ME, name: 'another tab of this account' },
    ]);

    expect(kicked).toEqual([HOST]);
    expect(election.isHost()).toBe(true);
  });

  it('alone in the room, clears whoever the server still lists and hosts', async () => {
    election.start(GAME, HOST, promoted);
    peers = 1;
    server.hostId = HOST;
    server.users = [ME, HOST, OTHER];

    await election.onPeersLeft([{ userId: OTHER, name: 'thea' }]);

    expect(kicked).toEqual([HOST, OTHER]);
    expect(election.isHost()).toBe(true);
    expect(promoted).toHaveBeenCalledTimes(1);
  });
});
