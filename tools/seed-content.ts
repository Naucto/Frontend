/**
 * Development seed: games with content a person could actually play.
 *
 * `seed:dev` in the Backend writes the people; this writes what they made. It goes through the real
 * create → save → publish endpoints rather than the database, so it exercises the same path the
 * editor takes, and a project that appears here is genuinely playable at `/play/:id`.
 *
 * Why this exists: an editor tab with no data measures nothing. The SOUND tab against a game with
 * no instruments only ever renders its empty state, so the piano roll, the voices lane and the
 * instrument inspector cannot be compared against the artboards at all.
 *
 * Run the Backend's `npm run seed:dev` first, then `npm run seed:content`. Idempotent: a game whose
 * name already exists for that author is updated in place, not duplicated.
 */
import * as Y from 'yjs';

import { BUBBLEGUM_16 } from '../packages/engine/src/game/defaults';
import { Game } from '../packages/engine/src/game/Game';
import { MAIN_FILE, MAP_HEIGHT, MAP_WIDTH, SPRITE_SIZE } from '../packages/engine/src/game/keys';
import type { Instrument, Note } from '../packages/engine/src/sound/model';
import { defaultInstrument, defaultPattern } from '../packages/engine/src/sound/model';
import { encodePng } from './png';

const API = process.env['NAUCTO_API'] ?? 'http://localhost:3000';
const PASSWORD = process.env['NAUCTO_SEED_PASSWORD'] ?? 'Naucto!dev1';

interface SeedGame {
  author: string;
  name: string;
  shortDesc: string;
  longDesc: string;
  tags: string[];
  /** Drawn into the sheet so the ART tab and the cover have something in them. */
  sprite: string[];
  withSound: boolean;
  /** Replaces the starter `main.lua`. Only set where a tab needs the game to do something. */
  source?: string;
  comments: { author: string; body: string; replies?: { author: string; body: string }[] }[];
}

const SNAKE = [
  '..1111..',
  '.111111.',
  '11.11.11',
  '11111111',
  '11111111',
  '1.1111.1',
  '11.11.11',
  '.1....1.',
];
const LANDER = [
  '...44...',
  '..4444..',
  '.444444.',
  '44444444',
  '4.4444.4',
  '..8..8..',
  '.8....8.',
  '8......8',
];
const FERRY = [
  '........',
  '..5555..',
  '.555555.',
  '55555555',
  '.111111.',
  '..1111..',
  '........',
  '........',
];

/**
 * The NET tab has nothing to draw until a game hosts and writes to `net.state` — which is why the
 * seed carries a game that does. Run it, accept the host dialog, and the tree fills in with a
 * container, three levels of nesting and both value types the design colours differently.
 */
const DUEL_SOURCE = `-- Two-player duel. Run it and accept the host dialog to fill the NET tab.

local me

function _init()
  net.host({ maxPlayers = 2 }, function()
    me = net.id()
    net.state.round = 1
    net.state.score = 1240
    net.state.mode = "duel"
    net.state.players = {
      [me] = { x = 152, y = 82, hp = 3, ready = true },
    }
  end)
end

function _update()
  if me == nil then return end
  local p = net.state.players[me]
  if input.btn("left") then p.x = p.x - 2 end
  if input.btn("right") then p.x = p.x + 2 end
  if input.btn("up") then p.y = p.y - 2 end
  if input.btn("down") then p.y = p.y + 2 end
end

function _draw()
  gfx.clear(0)
  if me == nil then
    gfx.print("hosting...", 8, 8, 5)
    return
  end
  for _, p in pairs(net.state.players) do
    gfx.draw_sprite(1, p.x, p.y)
  end
end
`;

const GAMES: SeedGame[] = [
  {
    author: 'ulysse',
    name: 'Snake 8-bit',
    shortDesc: 'The tick rate is the whole game.',
    longDesc:
      'A snake that steps every six frames and buffers one input, so a late turn still registers.\n\nArrows or WASD to steer. Z to restart.',
    tags: ['arcade', 'classic'],
    sprite: SNAKE,
    withSound: true,
    comments: [
      {
        author: 'louis',
        body: 'Got 1240 without dying once. The tick rate feels perfect — most snake clones are twitchier than this.',
        replies: [
          {
            author: 'ulysse',
            body: 'It steps every 6 frames and buffers one input, so a late turn still registers.',
          },
        ],
      },
      {
        author: 'edgar',
        body: 'Remixed it into a two-player version with net.state — took about twenty lines.',
      },
      {
        author: 'alexis',
        body: 'Playing this on a phone with the virtual pad is genuinely fine, which I did not expect.',
      },
      {
        author: 'marie',
        body: 'The wall collision feels one pixel generous and I am here for it.',
      },
      { author: 'vincent', body: 'Would love a speed setting.' },
    ],
  },
  {
    author: 'thea',
    name: 'Moon Lander',
    shortDesc: 'Thrust, drift, regret.',
    longDesc: 'Land under 2 m/s. Fuel is finite and gravity is not.',
    tags: ['arcade', 'physics'],
    sprite: LANDER,
    withSound: true,
    comments: [
      {
        author: 'thea',
        body: 'Fuel burn is per-frame while held, so tapping is cheaper than holding.',
      },
      {
        author: 'kenza',
        body: 'Landed on the third try. The shadow under the lander helps a lot.',
      },
    ],
  },
  {
    author: 'edgar',
    name: 'Ferry Click',
    shortDesc: 'Ferries, mostly.',
    longDesc: 'Click a ferry, it goes. That is the entire design document.',
    tags: ['puzzle', 'relaxing'],
    sprite: FERRY,
    withSound: false,
    comments: [{ author: 'louis', body: 'Unreasonably calming.' }],
  },
  {
    author: 'louis',
    name: 'Duel',
    shortDesc: 'Two players, one screen, shared state.',
    longDesc: 'Everything both players can see lives in net.state. The panel just shows it.',
    tags: ['multiplayer', 'arcade'],
    sprite: SNAKE,
    withSound: false,
    source: DUEL_SOURCE,
    comments: [{ author: 'edgar', body: 'Twenty lines of net.state and it just works. Rude.' }],
  },
  {
    author: 'alexis',
    name: 'Platformer Tutorial',
    shortDesc: 'A tiny run-and-jump, built as a tutorial.',
    longDesc: 'Every system in one screen: sprites, a map, collision, and a jump that feels right.',
    // The artboards use this project as their running example, so it carries every state they draw:
    // music for SOUND, a conversation for the game page, and the tag the hero's byline reads.
    tags: ['tutorial', 'platformer', 'remixable'],
    sprite: LANDER,
    withSound: true,
    comments: [
      {
        author: 'thea',
        body: 'The coyote time on the jump is what makes this feel right. Worth saying so in the code.',
        replies: [
          { author: 'alexis', body: 'Four frames. Any more and it starts to feel floaty.' },
        ],
      },
      { author: 'sacha', body: 'Followed it end to end and shipped something. Thank you.' },
      { author: 'julien', body: 'The map section could use one more screenshot.' },
    ],
  },
];

/** `Snake 8-bit` gets a fork so the game page has real lineage to render. */
const FORK = { of: 'Snake 8-bit', by: 'edgar', name: 'Snake Duo' };

// ---------------------------------------------------------------------------- api

interface ApiInit extends Omit<RequestInit, 'headers'> {
  token?: string;
  json?: unknown;
  /** A record rather than `HeadersInit`, so it can be spread without becoming a list of indices. */
  headers?: Record<string, string>;
}

async function api<T>(path: string, init: ApiInit = {}): Promise<T> {
  const { token, json, headers, ...rest } = init;
  const res = await fetch(`${API}${path}`, {
    ...rest,
    body: json === undefined ? rest.body : JSON.stringify(json),
    headers: {
      ...(json === undefined ? {} : { 'content-type': 'application/json' }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });
  if (!res.ok) {
    throw new Error(`${String(res.status)} ${init.method ?? 'GET'} ${path}: ${await res.text()}`);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

async function signIn(username: string): Promise<string> {
  const { access_token } = await api<{ access_token: string }>('/auth/login', {
    method: 'POST',
    json: { email: `${username}@naucto.local`, password: PASSWORD },
  });
  return access_token;
}

// ---------------------------------------------------------------------------- content

function drawSprite(game: Game, rows: string[]): void {
  for (let y = 0; y < SPRITE_SIZE; y++) {
    const row = rows[y] ?? '';
    for (let x = 0; x < SPRITE_SIZE; x++) {
      const ch = row[x] ?? '.';
      if (ch !== '.') game.setPixel(x, y, Number.parseInt(ch, 16));
    }
  }
}

/** A floor and a couple of platforms, so the MAP tab and the minimap are not blank. */
function drawMap(game: Game): void {
  for (let x = 0; x < MAP_WIDTH; x++) game.setTile(x, MAP_HEIGHT - 1, 1);
  for (let x = 6; x < 14; x++) game.setTile(x, MAP_HEIGHT - 6, 1);
  for (let x = 20; x < 26; x++) game.setTile(x, MAP_HEIGHT - 9, 1);
  for (let x = 34; x < 46; x++) game.setTile(x, MAP_HEIGHT - 5, 1);
}

/**
 * Rich enough that every part of the SOUND tab has something to draw.
 *
 * A thinner fixture left most of that screen empty — the voices lane, the SFX row and the
 * instrument list all rendered their "nothing here" shape, so a fidelity pass on the tab was
 * measuring the seed rather than the app.
 */
function addSound(game: Game): void {
  const instruments: Instrument[] = [
    { ...defaultInstrument('lead', 'lead'), osc: 'square', duty: 0.25, colour: 4 },
    {
      ...defaultInstrument('bass', 'bass'),
      osc: 'triangle',
      detune: -12,
      glide: 0.012,
      colour: 11,
    },
    { ...defaultInstrument('drum', 'drum'), osc: 'noise', colour: 2 },
    {
      ...defaultInstrument('pad', 'pad'),
      osc: 'saw',
      filter: { type: 'lp', cutoff: 2200, resonance: 0.3, envAmount: 0.2 },
      colour: 13,
    },
    { ...defaultInstrument('clap', 'clap'), osc: 'noise', colour: 6 },
  ];
  for (const i of instruments) game.setInstrument(i);

  const notes: Note[] = [];
  const melody = [0, 4, 7, 12, 7, 4, 0, 4];
  melody.forEach((semitone, i) => {
    notes.push({ step: i * 2, pitch: 60 + semitone, length: 2, instrument: 'lead', volume: 0.8 });
  });
  for (let i = 0; i < 4; i++) {
    notes.push({ step: i * 4, pitch: 36, length: 4, instrument: 'bass', volume: 0.9 });
  }
  // Backbeat and a pad underneath, so the lane shows more than two stripes.
  for (let i = 0; i < 8; i++) {
    notes.push({ step: i * 2, pitch: 48, length: 1, instrument: 'drum', volume: 0.7 });
  }
  for (const step of [4, 12]) {
    notes.push({ step, pitch: 50, length: 1, instrument: 'clap', volume: 0.8 });
  }
  for (const [step, pitch] of [
    [0, 55],
    [8, 57],
  ] as const) {
    notes.push({ step, pitch, length: 8, instrument: 'pad', volume: 0.5 });
  }
  game.setPattern({ ...defaultPattern('00', 'main'), bpm: 124, steps: 16, notes });

  // Two short patterns parked in SFX slots, which is what fills the 16-slot grid at the bottom.
  game.setPattern({
    ...defaultPattern('01', 'jump'),
    bpm: 124,
    steps: 4,
    notes: [
      { step: 0, pitch: 72, length: 1, instrument: 'lead', volume: 0.9 },
      { step: 1, pitch: 79, length: 1, instrument: 'lead', volume: 0.9 },
    ],
  });
  game.setPattern({
    ...defaultPattern('02', 'hit'),
    bpm: 124,
    steps: 4,
    notes: [{ step: 0, pitch: 45, length: 2, instrument: 'drum', volume: 1 }],
  });
  game.sfx.set('0', '01');
  game.sfx.set('1', '02');
}

/** Replaces the starter code in place, so the entry file keeps its deterministic id. */
function setMainSource(game: Game, source: string): void {
  const main = game.files.find((f) => f.name === MAIN_FILE);
  if (!main) return;
  main.text.delete(0, main.text.length);
  main.text.insert(0, source);
}

/**
 * A screen-sized cover drawn from the game's own sprite, on its own palette.
 *
 * Not decoration: a game without one leaves every surface that shows cover art on its placeholder,
 * so none of them can be compared to the artboards at all.
 */
function buildCover(seed: SeedGame): Uint8Array {
  const W = 320;
  const H = 180;
  const rgb = new Uint8Array(W * H * 3);
  const hex = (i: number): [number, number, number] => {
    const v = BUBBLEGUM_16[i % BUBBLEGUM_16.length] ?? '#000000';
    return [
      Number.parseInt(v.slice(1, 3), 16),
      Number.parseInt(v.slice(3, 5), 16),
      Number.parseInt(v.slice(5, 7), 16),
    ];
  };
  const put = (x: number, y: number, c: [number, number, number]): void => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const at = (y * W + x) * 3;
    rgb[at] = c[0];
    rgb[at + 1] = c[1];
    rgb[at + 2] = c[2];
  };

  // A horizon so the sprite has something to stand on. The ground is the sky darkened rather than
  // a palette slot: slot 0 is near-black, which against a bright sky drew a hard black bar across
  // the bottom third of every card, hero and JUMP BACK IN thumbnail — it read as a broken layout.
  const sky = hex(seed.sprite.length % 4 === 0 ? 11 : 9);
  const ground = sky.map((c) => Math.round(c * 0.45)) as [number, number, number];
  const horizon = H - 34;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) put(x, y, y >= horizon ? ground : sky);
  }

  // The sprite at 12×, standing on the horizon rather than centred in the sky above it.
  const scale = 12;
  const originX = Math.round((W - SPRITE_SIZE * scale) / 2);
  const originY = horizon - SPRITE_SIZE * scale + 6;
  seed.sprite.forEach((row, y) => {
    Array.from(row).forEach((ch, x) => {
      if (ch === '.') return;
      const c = hex(Number.parseInt(ch, 16));
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++)
          put(originX + x * scale + dx, originY + y * scale + dy, c);
      }
    });
  });

  return encodePng(W, H, rgb);
}

function buildContent(seed: SeedGame): Uint8Array {
  const doc = new Y.Doc();
  const game = new Game(doc);
  game.seedDefaults();
  if (seed.source !== undefined) setMainSource(game, seed.source);
  drawSprite(game, seed.sprite);
  drawMap(game);
  if (seed.withSound) addSound(game);
  return Y.encodeStateAsUpdate(doc);
}

// ---------------------------------------------------------------------------- seeding

interface ProjectRow {
  id: number;
  name: string;
}

async function findOwn(token: string, name: string): Promise<ProjectRow | undefined> {
  const mine = await api<{ projects: ProjectRow[] }>('/projects?limit=100', { token });
  return mine.projects.find((p) => p.name === name);
}

async function seedGame(seed: SeedGame): Promise<number> {
  const token = await signIn(seed.author);
  let project = await findOwn(token, seed.name);
  project ??= await api<ProjectRow>('/projects', {
    method: 'POST',
    token,
    json: { name: seed.name, shortDesc: seed.shortDesc, tags: seed.tags },
  });

  // longDesc, tags and status are not on the create DTO; they come in on the update.
  await api<unknown>(`/projects/${String(project.id)}`, {
    method: 'PUT',
    token,
    json: {
      name: seed.name,
      shortDesc: seed.shortDesc,
      longDesc: seed.longDesc,
      tags: seed.tags,
      status: 'COMPLETED',
    },
  });

  const form = new FormData();
  const content = buildContent(seed);
  // `new Blob([bytes])` would spread the array into a list of indices under the lint's
  // no-misused-spread rule; wrap the buffer instead.
  form.append('file', new Blob([content.buffer as ArrayBuffer]), `${seed.name}.ncto`);
  await api<unknown>(`/projects/${String(project.id)}/saveContent`, {
    method: 'PATCH',
    token,
    body: form,
  });
  // The cover goes on before the release is cut, so the published release carries it.
  const cover = new FormData();
  const png = buildCover(seed);
  cover.append('file', new Blob([png.buffer as ArrayBuffer], { type: 'image/png' }), 'cover.png');
  await api<unknown>(`/projects/${String(project.id)}/image`, {
    method: 'POST',
    token,
    body: cover,
  });

  await api<unknown>(`/projects/${String(project.id)}/publish`, { method: 'POST', token });
  return project.id;
}

/**
 * Every comment body already on the project, replies included. Comments have no natural key, so
 * the body is the only thing to match on — good enough for a seed whose bodies are hand-written
 * and distinct, and the alternative is a thread that doubles in length on every run.
 */
async function existingComments(projectId: number): Promise<Set<string>> {
  const seen = new Set<string>();
  const page = await api<{ comments?: { content?: string; replies?: { content?: string }[] }[] }>(
    `/projects/${String(projectId)}/comments?limit=100`,
  );
  for (const c of page.comments ?? []) {
    if (c.content) seen.add(c.content);
    for (const r of c.replies ?? []) if (r.content) seen.add(r.content);
  }
  return seen;
}

async function seedComments(projectId: number, seed: SeedGame): Promise<void> {
  const seen = await existingComments(projectId);
  for (const c of seed.comments) {
    if (seen.has(c.body)) continue;
    const token = await signIn(c.author);
    const created = await api<{ id: number }>(`/projects/${String(projectId)}/comments`, {
      method: 'POST',
      token,
      json: { content: c.body },
    });
    for (const r of c.replies ?? []) {
      if (seen.has(r.body)) continue;
      const replyToken = await signIn(r.author);
      await api<unknown>(`/projects/${String(projectId)}/comments/${String(created.id)}/reply`, {
        method: 'POST',
        token: replyToken,
        json: { content: r.body },
      });
    }
  }
}

async function main(): Promise<void> {
  if (!API.includes('localhost') && !API.includes('127.0.0.1')) {
    throw new Error(`seed:content refuses to write to ${API}; it is a local development fixture.`);
  }

  const ids = new Map<string, number>();
  for (const seed of GAMES) {
    const id = await seedGame(seed);
    ids.set(seed.name, id);
    console.log(`published #${String(id)} ${seed.name} (${seed.author})`);
    await seedComments(id, seed);
  }

  const source = ids.get(FORK.of);
  if (source !== undefined) {
    const token = await signIn(FORK.by);
    try {
      const fork = await api<ProjectRow>(`/projects/${String(source)}/fork`, {
        method: 'POST',
        token,
      });
      // A fork counts as a remix only once it has a published release, so forking without this
      // left the lineage sections empty however many forks the seed made.
      await api<unknown>(`/projects/${String(fork.id)}/publish`, { method: 'POST', token });
      console.log(`forked ${FORK.of} as ${FORK.name} (${FORK.by}), published #${String(fork.id)}`);
    } catch (error) {
      // A second run hits the "already forked" path; the lineage is there either way.
      console.log(`fork skipped: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log(`seeded ${String(ids.size)} playable games with content, comments and a fork`);
}

await main();
