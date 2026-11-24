import type { Page } from '@playwright/test';

import { uuidOf } from '../../packages/api-client/testing';
import { answer } from './session';

/** A session of game 42 with two of its four seats taken, as the API answers it. */
export const ROOM = {
  sessionUuid: '7d0f6a52-4c1b-4f0e-9a51-2f6f0c7b9e11',
  title: 'Friday night',
  visibility: 'PUBLIC',
  hostId: uuidOf(11),
  hostUsername: 'louis',
  projectId: uuidOf(42),
  projectName: 'Cave Diver',
  maxPlayers: 4,
  playerCount: 2,
  startedAt: '2026-11-21T10:00:00.000Z',
  roster: [
    { id: uuidOf(11), username: 'louis' },
    { id: uuidOf(12), username: 'lea' },
  ],
  coverUrl: null,
  disk: null,
};

/**
 * A game that joins from `_init` the session it was opened on. A published game has no console, so
 * it says where it got to the one way a player can see, by stopping on an error: which session it
 * is in, or that it is at its menu.
 */
export const JOINS_FROM_INIT = [
  'local invite, joined',
  'function _init()',
  '  invite = net.invite()',
  '  if invite then',
  '    net.join(function() joined = true end)',
  '  end',
  'end',
  'function _update()',
  '  if joined then',
  '    error("in " .. invite.title .. " of " .. invite.host .. ", " .. invite.players .. " of " .. invite.max_players)',
  '  elseif not invite then',
  '    error("at the menu")',
  '  end',
  'end',
].join('\n');

/** What entering a session answers: the player's number at the table and where to signal. */
export const connection = (
  sessionUuid: string,
  playerId: number | undefined,
  joinCode?: string,
): Record<string, unknown> => ({
  sessionUuid,
  playerId,
  joinCode,
  connectionTicket: 'ticket',
  webrtcConfig: {
    signaling: ['ws://localhost/e2e-game-socket'],
    peerOpts: { config: { iceServers: [] } },
  },
});

export interface RoomMock {
  /** The body of every join asked, in order. */
  joins: unknown[];
  /** The query of every lookup of the room, in order. */
  lookups: string[];
  /** Tells the client its host closed the room; false while no client is connected to be told. */
  end(): boolean;
}

/**
 * A room a player can enter. It answers by its id, and its join answers a connection whose
 * signaling socket takes the client in and says nothing. `refuse` is the status and the message
 * the join fails with instead; `gone` makes the room answer 404 as an ended one does.
 */
export async function mockRoom(
  page: Page,
  room: { sessionUuid: string } = ROOM,
  { gone = false, refuse }: { gone?: boolean; refuse?: { status: number; message: string } } = {},
): Promise<RoomMock> {
  const joins: unknown[] = [];
  const lookups: string[] = [];
  const sockets: { send(frame: string): void }[] = [];
  const at = `/game-sessions/${room.sessionUuid}`;
  const missing = { message: `No game session found for UUID ${room.sessionUuid}` };

  await page.route(
    (url) => url.pathname.endsWith(at),
    (route) => {
      lookups.push(new URL(route.request().url()).search);
      return answer(gone ? 404 : 200, gone ? missing : room)(route);
    },
  );
  await page.route(
    (url) => url.pathname.endsWith(`${at}/join`),
    (route) => {
      joins.push(route.request().postDataJSON());
      if (gone || refuse) {
        return answer(refuse?.status ?? 404, refuse ? { message: refuse.message } : missing)(route);
      }
      return answer(200, connection(room.sessionUuid, 1))(route);
    },
  );
  await page.route((url) => url.pathname.endsWith(`${at}/leave`), answer(200, {}));
  await page.routeWebSocket(/e2e-game-socket/, (socket) => {
    sockets.push(socket);
  });

  return {
    joins,
    lookups,
    end: () => {
      for (const socket of sockets) {
        socket.send(JSON.stringify({ type: 'session-ended' }));
      }
      return sockets.length > 0;
    },
  };
}

/** Someone in a room, as its players route names them: an account and the number it plays under. */
export interface SeatedPlayer {
  userId: string;
  username: string;
  nickname: string | null;
  host: boolean;
  playerId: number;
}

/**
 * A room the signed-in player hosts. Creating it answers a connection under the host's number,
 * its players route answers `players`, and each of them has a picture. `sit` tells the host that
 * a player reached the table; false while the host is not connected to be told.
 */
export async function mockHostedRoom(
  page: Page,
  sessionUuid: string,
  players: SeatedPlayer[],
): Promise<{ sit(player: number): boolean }> {
  const sockets: { send(frame: string): void }[] = [];

  await page.route(
    '**/game-sessions',
    answer(
      201,
      connection(sessionUuid, players.find((player) => player.host)?.playerId, 'ABCD2345'),
    ),
  );
  await page.route(
    `**/game-sessions/${sessionUuid}/players`,
    answer(200, { players, maxPlayers: 4 }),
  );
  for (const { userId, username } of players) {
    await page.route(
      `**/users/public/${userId}/profile`,
      answer(200, { data: { id: userId, username, profileImageUrl: '/img/logo.svg' } }),
    );
  }
  await page.routeWebSocket(/e2e-game-socket/, (socket) => {
    sockets.push(socket);
  });

  return {
    sit: (player) => {
      for (const socket of sockets) {
        socket.send(JSON.stringify({ type: 'peer-joined', userId: player }));
      }
      return sockets.length > 0;
    },
  };
}
