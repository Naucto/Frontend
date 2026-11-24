import type { CollectionVisibility } from '@naucto/api-client';
import { uuidOf } from '@naucto/api-client/testing';
import { BUBBLEGUM_16 } from '@naucto/engine';

import type { HeroEntry } from '../../shared/hub/hero-pile.component';
import type { HubGame, HubSession } from '../../shared/hub/hub-game';

/**
 * A stand-in cover in three palette colours: a night sky with a few stars and a moon, over a
 * skyline whose heights and lit windows come from the seed.
 */
function cover(seed: number, sky: number, ground: number, mark: number): string {
  const colour = (slot: number): string => BUBBLEGUM_16[slot % BUBBLEGUM_16.length] ?? '';
  const rect = (x: number, y: number, width: number, height: number, slot: number): string =>
    `<rect x="${String(x)}" y="${String(y)}" width="${String(width)}" height="${String(height)}" fill="${colour(slot)}"/>`;
  let state = seed * 7919;
  const next = (below: number): number => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state % below;
  };
  const stars = Array.from({ length: 14 }, () => rect(next(64), next(16), 1, 1, mark));
  const towers = Array.from({ length: 16 }, (_, i) => {
    const height = 6 + next(14);
    const windows = Array.from({ length: 3 }, () =>
      rect(i * 4 + 1 + next(2), 36 - height + 2 + next(height - 3), 1, 1, mark),
    );
    return rect(i * 4, 36 - height, 4, height, ground) + windows.join('');
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 64 36" shape-rendering="crispEdges">${rect(0, 0, 64, 36, sky)}${stars.join('')}${rect(46 + next(8), 4, 6, 6, mark)}${towers.join('')}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** The item at an index taken around the list, which the fixtures never leave empty. */
function pick<T>(list: readonly T[], index: number): T {
  const item = list[index % list.length];
  if (item === undefined) {
    throw new Error('A fixture list is empty.');
  }
  return item;
}

interface Person {
  id: string;
  username: string;
}

const PEOPLE: readonly Person[] = [
  'you',
  'louis',
  'lea',
  'theo',
  'emma',
  'tom',
  'ines',
  'sara',
  'marc',
  'nina',
  'yann',
  'zoe',
].map((username, at) => ({ id: uuidOf(at + 1), username }));

/** The signed-in player of the showcase. */
export const VIEWER = 'you';

const person = (index: number): Person => pick(PEOPLE, index);

/** Name, description, tags, then the disk's colour and the cover's three, as palette slots. */
const CATALOGUE: readonly (readonly [
  string,
  string,
  readonly string[],
  number,
  number,
  number,
  number,
])[] = [
  [
    'High Tide Plinko',
    'Drop the ball, ride the tide and chain the bumpers before the water takes the board.',
    ['arcade', 'chill'],
    14,
    15,
    14,
    4,
  ],
  [
    'Night Survivors',
    'Hold the clearing until dawn. Every wave leaves a relic; every relic changes the build.',
    ['action', 'roguelite'],
    9,
    9,
    8,
    7,
  ],
  [
    'Puyo Tsu',
    'Stack, pop and send the garbage back. Two players, one well each, no mercy.',
    ['puzzle', 'two-player'],
    13,
    10,
    13,
    6,
  ],
  [
    'Neon Rush',
    'A one-button runner through a city that rebuilds itself every lap.',
    ['arcade', 'action'],
    7,
    0,
    9,
    7,
  ],
  [
    'Chaser of Dawn',
    'A small platformer about outrunning the night, one screen at a time.',
    ['platformer'],
    3,
    3,
    2,
    4,
  ],
  [
    'Balatrino',
    'Poker hands as a dungeon. Play the flush, keep the joker, pray for the river.',
    ['cards', 'roguelite'],
    2,
    1,
    0,
    5,
  ],
  [
    'Hypergrid',
    'Rotate the grid, line up the cores and never let the timer see zero.',
    ['puzzle'],
    11,
    15,
    10,
    11,
  ],
  [
    '8 Ball Club',
    'Pool with real spin, a smoky room and a friend across the table.',
    ['sports', 'two-player'],
    13,
    13,
    14,
    5,
  ],
  [
    'Bomberman',
    'Four corners, too many bombs. The classic, rebuilt for netplay.',
    ['action', 'two-player'],
    5,
    10,
    11,
    3,
  ],
  [
    'Draw Together',
    'One shared canvas, sixteen colours and no undo. Be kind.',
    ['chill', 'two-player'],
    6,
    5,
    6,
    7,
  ],
  [
    'Pocket Rogue',
    'Twenty floors in your pocket. Short runs, long grudges.',
    ['roguelite'],
    8,
    8,
    9,
    12,
  ],
  [
    'Tico Park',
    'Everyone has to reach the door. Nobody agrees on how.',
    ['platformer', 'two-player'],
    12,
    11,
    12,
    4,
  ],
  [
    'Echo',
    'Your last run plays beside you. Beat it, or learn from it.',
    ['puzzle', 'chill'],
    10,
    10,
    15,
    11,
  ],
  [
    'Shoot Them Up',
    'Six stages, three ships, one credit. The bullets are the level design.',
    ['shooter', 'arcade'],
    1,
    0,
    1,
    3,
  ],
];

export const GAMES: readonly HubGame[] = CATALOGUE.map(
  ([name, shortDesc, tags, disk, sky, ground, mark], index) => ({
    id: uuidOf(index + 1),
    name,
    shortDesc,
    tags,
    viewCount: 18400 - index * 1230,
    likes: 960 - index * 61,
    creator: person(index + 1),
    coverUrl: cover(index + 1, sky, ground, mark),
    commentCount: 42 - index * 3,
    disk: { color: BUBBLEGUM_16[disk] ?? '', finish: 'solid' },
  }),
);

export const HERO: readonly HeroEntry[] = [
  'Game of the week',
  'Continue',
  'Trending',
  'Because you played High Tide Plinko',
].map((reason, index) => ({ reason, game: pick(GAMES, index), mine: index === 1 }));

/** Players seated and seats in all, per session; the second one has the viewer in it. */
const SEATS: readonly (readonly [number, number])[] = [
  [2, 4],
  [3, 4],
  [9, 12],
  [1, 2],
  [4, 4],
  [6, 8],
];

export function openSessions(now: number): HubSession[] {
  return SEATS.map(([seated, seats], index) => {
    const game = pick(GAMES, index * 3 + 2);
    // A session names eight of its players at most.
    const roster = Array.from({ length: Math.min(seated, 8) }, (_, seat) => {
      const { id, username } = index === 1 && seat === 1 ? person(0) : person(index + seat + 1);
      return { id, username };
    });
    return {
      sessionUuid: `session-${String(index)}`,
      startedAt: new Date(now - (3 + index * 9) * 60_000).toISOString(),
      projectId: game.id,
      projectName: game.name,
      coverUrl: game.coverUrl ?? null,
      disk: game.disk,
      hostUsername: roster[0]?.username ?? '',
      roster,
      playerCount: seated,
      maxPlayers: seats,
    };
  });
}

interface Collection {
  title: string;
  curator: Person;
  total: number;
  games: readonly HubGame[];
  /** Set on the viewer's own, whose plate says who can open it. */
  visibility?: CollectionVisibility;
}

export const COLLECTIONS: readonly Collection[] = [
  { title: 'Couch co-op', curator: person(1), total: 6, games: GAMES.slice(2, 8) },
  { title: 'Tiny shooters', curator: person(3), total: 3, games: GAMES.slice(11, 14) },
  {
    title: 'Everything we loved at the 2026 game jam',
    curator: person(9),
    total: 52,
    games: GAMES,
  },
  {
    title: 'To try later',
    curator: person(0),
    total: 2,
    games: GAMES.slice(0, 2),
    visibility: 'PRIVATE',
  },
];
