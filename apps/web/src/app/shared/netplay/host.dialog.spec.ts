import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { signal } from '@angular/core';
import { client, type SessionPlayerDto } from '@naucto/api-client';
import { uuidOf } from '@naucto/api-client/testing';
import type { PlayerNumber } from '@naucto/engine';
import { render, screen } from '@testing-library/angular';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthStore } from '../../core/auth/auth.store';
import type { NetUiBridgeService } from '../../core/net/net-bridge.service';
import { testProviders } from '../../testing/providers';
import { HostDialogComponent, type HostDialogData } from './host.dialog';

const realFetch = globalThis.fetch;

const ROOM = '5b1d2a0e-93c4-4f6e-8a57-0c7de1f2a934';
/** The host's own number, far from the small number its account id is written with. */
const HOST = 1042;

const louis: SessionPlayerDto = {
  userId: uuidOf(1),
  username: 'louis',
  nickname: null,
  host: true,
  playerId: HOST,
};
const lea: SessionPlayerDto = {
  userId: uuidOf(12),
  username: 'lea',
  nickname: 'Léa',
  host: false,
  playerId: 1043,
};

describe('HostDialogComponent', () => {
  let roster: SessionPlayerDto[];
  let asked: string[];
  const peers = signal<PlayerNumber[]>([]);

  const open = async (): Promise<void> => {
    const bridge = {
      info: signal({
        uuid: ROOM,
        role: 'host',
        joinCode: 'ABCD2345',
        maxPlayers: 4,
        title: 'Friday night',
        listed: false,
      }),
      session: signal({ selfPlayer: HOST }),
      peers,
    } as unknown as NetUiBridgeService;
    const data: HostDialogData = {
      bridge,
      projectId: uuidOf(42),
      options: { maxPlayers: 4, title: 'Friday night' },
    };
    await render(HostDialogComponent, {
      providers: [
        ...testProviders(),
        { provide: DialogRef, useValue: { close: vi.fn() } },
        { provide: DIALOG_DATA, useValue: data },
        {
          provide: AuthStore,
          useValue: { user: signal({ id: uuidOf(1), username: 'louis', nickname: null }) },
        },
      ],
    });
  };

  /** The label of each taken seat, in order: the name its face is drawn under. */
  const seated = (): (string | null)[] =>
    Array.from(document.querySelectorAll('nc-avatar'), (seat) => seat.getAttribute('aria-label'));

  beforeEach(() => {
    roster = [louis, lea];
    asked = [];
    peers.set([]);
    client.setConfig({ baseUrl: 'https://api.test', throwOnError: false });
    globalThis.fetch = (input: RequestInfo | URL): Promise<Response> => {
      const { pathname } = new URL(input instanceof Request ? input.url : input);
      asked.push(pathname);
      const body = pathname.endsWith('/players')
        ? { players: roster, maxPlayers: 4 }
        : { data: { profileImageUrl: `/faces${pathname}.png` } };
      return Promise.resolve(
        new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } }),
      );
    };
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('seats the host alone without asking who else is in', async () => {
    await open();

    expect(seated()).toEqual(['louis']);
    expect(asked).not.toContain(`/game-sessions/${ROOM}/players`);
  });

  it('names and draws a player from the account the roster gives their number', async () => {
    peers.set([lea.playerId]);
    await open();

    await vi.waitFor(() => {
      expect(seated()).toEqual(['louis', 'Léa']);
    });
    await vi.waitFor(() => {
      expect(screen.getByAltText('Léa').getAttribute('src')).toBe(
        `/faces/users/public/${lea.userId}/profile.png`,
      );
    });
  });

  it('names a player by their username when they chose no nickname', async () => {
    roster = [louis, { ...lea, nickname: null }];
    peers.set([lea.playerId]);
    await open();

    await vi.waitFor(() => {
      expect(seated()).toEqual(['louis', 'lea']);
    });
  });

  it('keeps a number the roster does not hold as a player without a face', async () => {
    peers.set([lea.playerId, 987654321]);
    await open();

    await vi.waitFor(() => {
      expect(seated()).toEqual(['louis', 'Léa', 'player 987654321']);
    });
    expect(asked.filter((path) => path.startsWith('/users/public/'))).toEqual([
      `/users/public/${uuidOf(1)}/profile`,
      `/users/public/${lea.userId}/profile`,
    ]);
  });

  it('asks the roster again when someone reaches the table', async () => {
    roster = [louis];
    peers.set([lea.playerId]);
    await open();
    await vi.waitFor(() => {
      expect(seated()).toEqual(['louis', 'player 1043']);
    });

    roster = [
      louis,
      lea,
      { ...lea, userId: uuidOf(13), username: 'max', nickname: null, playerId: 1044 },
    ];
    peers.set([lea.playerId, 1044]);

    await vi.waitFor(() => {
      expect(seated()).toEqual(['louis', 'Léa', 'max']);
    });
  });
});
