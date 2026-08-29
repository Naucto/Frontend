import * as Y from 'yjs';

import { type DeclaredAction, isAction } from '../input/ActionMap';
import type { Instrument, Pattern, Song } from '../sound/model';
import {
  BUBBLEGUM_16,
  DEFAULT_GAME_CODE,
  DEFAULT_PLAYER_SPRITE,
  DEFAULT_PLAYER_SPRITE_INDICES,
  DEFAULT_SPRITE_COLOUR,
} from './defaults';
import {
  GAME_SCHEMA_VERSION,
  KEYS,
  MAIN_FILE,
  MAIN_FILE_ID,
  MAP_HEIGHT,
  MAP_WIDTH,
  PALETTE_SIZE,
  SHEET_HEIGHT,
  SHEET_WIDTH,
  SPRITE_COUNT,
  SPRITE_SIZE,
  SPRITES_PER_ROW,
} from './keys';

export interface PixelChange {
  x: number;
  y: number;
  colour: number;
}
export interface TileChange {
  x: number;
  y: number;
  sprite: number;
}
type Unsubscribe = () => void;

export interface CodeFile {
  id: string;
  name: string;
  order: number;
  text: Y.Text;
}

const coordKey = (x: number, y: number): string => `${String(x)},${String(y)}`;
const parseCoord = (key: string): [number, number] => {
  const i = key.indexOf(',');
  return [Number(key.slice(0, i)), Number(key.slice(i + 1))];
};

/** Origin of a tool-local transaction so observers can tell local edits from remote ones. */
export const LOCAL_ORIGIN = 'local';

/** Roots the editor writes directly, outside anything {@link Game} models. */
const RESTORED_TEXTS = [
  KEYS.projectName,
  KEYS.shortDescription,
  KEYS.longDescription,
  KEYS.iconUrl,
  KEYS.projectTags,
] as const;

/** Makes `target` hold exactly what `source` holds, touching only the keys that differ. */
function replaceMap<T>(target: Y.Map<T>, source: Y.Map<T>): void {
  for (const key of [...target.keys()]) {
    if (!source.has(key)) target.delete(key);
  }
  source.forEach((value, key) => {
    if (target.get(key) !== value) target.set(key, value);
  });
}

function replaceArray<T>(target: Y.Array<T>, source: Y.Array<T>): void {
  const wanted = source.toArray();
  if (target.length === wanted.length && target.toArray().every((v, i) => v === wanted[i])) return;
  target.delete(0, target.length);
  target.insert(0, wanted);
}

/**
 * Rewrites the smallest span that differs, so restoring a file nobody edited is free and restoring
 * one that was edited at the end does not re-type the whole thing.
 */
function replaceText(target: Y.Text, wanted: string): void {
  const current = target.toString();
  if (current === wanted) return;
  let head = 0;
  const max = Math.min(current.length, wanted.length);
  while (head < max && current[head] === wanted[head]) head++;
  let tail = 0;
  while (
    tail < max - head &&
    current[current.length - 1 - tail] === wanted[wanted.length - 1 - tail]
  )
    tail++;
  const removed = current.length - head - tail;
  if (removed > 0) target.delete(head, removed);
  const added = wanted.slice(head, wanted.length - tail);
  if (added) target.insert(head, added);
}

/**
 * Typed, observable access to a game document (Yjs). Materialises the sprite
 * sheet, flags and tile map as typed arrays kept in sync from Yjs events so the
 * renderer and editors never iterate 16k map entries per frame.
 */
export class Game {
  readonly doc: Y.Doc;
  readonly meta: Y.Map<unknown>;
  readonly codeFiles: Y.Map<Y.Map<unknown>>;
  readonly codeMeta: Y.Map<string>;
  readonly paletteArray: Y.Array<string>;
  readonly spritesMap: Y.Map<number>;
  readonly flagsMap: Y.Map<number>;
  readonly tilesMap: Y.Map<number>;
  readonly instruments: Y.Map<string>;
  readonly patterns: Y.Map<string>;
  readonly sfx: Y.Map<string>;
  readonly songs: Y.Map<string>;
  readonly samples: Y.Map<string>;
  readonly netPermissions: Y.Map<{ flags: number }>;

  /** 128×128 palette indices, row-major. */
  readonly sheet = new Uint8Array(SHEET_WIDTH * SHEET_HEIGHT);
  /** One byte of flags per sprite. */
  readonly flags = new Uint8Array(SPRITE_COUNT);
  /** 128×32 sprite indices, row-major. */
  readonly tiles = new Uint8Array(MAP_WIDTH * MAP_HEIGHT);

  private readonly pixelListeners = new Set<(changes: PixelChange[]) => void>();
  private readonly tileListeners = new Set<(changes: TileChange[]) => void>();
  private readonly flagListeners = new Set<() => void>();
  private readonly paletteListeners = new Set<() => void>();

  constructor(doc: Y.Doc) {
    this.doc = doc;
    this.meta = doc.getMap(KEYS.meta);
    this.codeFiles = doc.getMap(KEYS.codeFiles);
    this.codeMeta = doc.getMap(KEYS.codeMeta);
    this.paletteArray = doc.getArray(KEYS.palette);
    this.spritesMap = doc.getMap(KEYS.sprites);
    this.flagsMap = doc.getMap(KEYS.flags);
    this.tilesMap = doc.getMap(KEYS.tiles);
    this.instruments = doc.getMap(KEYS.instruments);
    this.patterns = doc.getMap(KEYS.patterns);
    this.sfx = doc.getMap(KEYS.sfx);
    this.songs = doc.getMap(KEYS.songs);
    this.samples = doc.getMap(KEYS.samples);
    this.netPermissions = doc.getMap(KEYS.netPermissions);

    this.spritesMap.forEach((v, k) => {
      const [x, y] = parseCoord(k);
      if (x >= 0 && x < SHEET_WIDTH && y >= 0 && y < SHEET_HEIGHT)
        this.sheet[y * SHEET_WIDTH + x] = v & 0xf;
    });
    this.flagsMap.forEach((v, k) => {
      const i = Number(k);
      if (i >= 0 && i < SPRITE_COUNT) this.flags[i] = v & 0xff;
    });
    this.tilesMap.forEach((v, k) => {
      const [x, y] = parseCoord(k);
      if (x >= 0 && x < MAP_WIDTH && y >= 0 && y < MAP_HEIGHT)
        this.tiles[y * MAP_WIDTH + x] = v & 0xff;
    });

    this.spritesMap.observe((e) => {
      const changes: PixelChange[] = [];
      e.changes.keys.forEach((_c, key) => {
        const [x, y] = parseCoord(key);
        if (x < 0 || x >= SHEET_WIDTH || y < 0 || y >= SHEET_HEIGHT) return;
        const colour = (this.spritesMap.get(key) ?? 0) & 0xf;
        this.sheet[y * SHEET_WIDTH + x] = colour;
        changes.push({ x, y, colour });
      });
      if (changes.length)
        this.pixelListeners.forEach((l) => {
          l(changes);
        });
    });
    this.flagsMap.observe((e) => {
      e.changes.keys.forEach((_c, key) => {
        const i = Number(key);
        if (i >= 0 && i < SPRITE_COUNT) this.flags[i] = (this.flagsMap.get(key) ?? 0) & 0xff;
      });
      this.flagListeners.forEach((l) => {
        l();
      });
    });
    this.tilesMap.observe((e) => {
      const changes: TileChange[] = [];
      e.changes.keys.forEach((_c, key) => {
        const [x, y] = parseCoord(key);
        if (x < 0 || x >= MAP_WIDTH || y < 0 || y >= MAP_HEIGHT) return;
        const sprite = (this.tilesMap.get(key) ?? 0) & 0xff;
        this.tiles[y * MAP_WIDTH + x] = sprite;
        changes.push({ x, y, sprite });
      });
      if (changes.length)
        this.tileListeners.forEach((l) => {
          l(changes);
        });
    });
    this.paletteArray.observe(() => {
      this.paletteListeners.forEach((l) => {
        l();
      });
    });
  }

  // ---- meta -----------------------------------------------------------------

  get schemaVersion(): number {
    const v = this.meta.get('schemaVersion');
    return typeof v === 'number' ? v : 0;
  }

  get compat(): boolean {
    return this.meta.get('compat') !== false;
  }

  /**
   * Action names the game declared with `input.declare`, persisted so the controls table and the
   * public "how to play" can show them without running the game. Empty when it declares nothing,
   * in which case callers fall back to the engine's action ids.
   */
  get declaredActions(): readonly DeclaredAction[] {
    const raw = this.meta.get('actions');
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (a): a is DeclaredAction =>
        typeof a === 'object' &&
        a !== null &&
        isAction((a as DeclaredAction).action) &&
        typeof (a as DeclaredAction).label === 'string',
    );
  }

  setDeclaredActions(actions: readonly DeclaredAction[]): void {
    const next = actions.map((a) => ({ action: a.action, label: a.label }));
    if (JSON.stringify(next) === JSON.stringify(this.declaredActions)) return;
    this.doc.transact(() => {
      this.meta.set('actions', next);
    }, LOCAL_ORIGIN);
  }

  // ---- palette --------------------------------------------------------------

  get palette(): string[] {
    const p = this.paletteArray.toArray();
    if (p.length === PALETTE_SIZE) return p;
    return [...BUBBLEGUM_16];
  }

  setPaletteColour(index: number, hex: string): void {
    if (index < 0 || index >= PALETTE_SIZE) return;
    this.doc.transact(() => {
      if (this.paletteArray.length !== PALETTE_SIZE) {
        this.paletteArray.delete(0, this.paletteArray.length);
        this.paletteArray.insert(0, [...BUBBLEGUM_16]);
      }
      this.paletteArray.delete(index, 1);
      this.paletteArray.insert(index, [hex.toLowerCase()]);
    }, LOCAL_ORIGIN);
  }

  setPalette(colours: readonly string[]): void {
    this.doc.transact(() => {
      this.paletteArray.delete(0, this.paletteArray.length);
      this.paletteArray.insert(
        0,
        colours.slice(0, PALETTE_SIZE).map((c) => c.toLowerCase()),
      );
    }, LOCAL_ORIGIN);
  }

  onPaletteChange(l: () => void): Unsubscribe {
    this.paletteListeners.add(l);
    return () => this.paletteListeners.delete(l);
  }

  // ---- sprites --------------------------------------------------------------

  getPixel(x: number, y: number): number {
    if (x < 0 || x >= SHEET_WIDTH || y < 0 || y >= SHEET_HEIGHT) return 0;
    return this.sheet[y * SHEET_WIDTH + x] ?? 0;
  }

  setPixel(x: number, y: number, colour: number): void {
    if (x < 0 || x >= SHEET_WIDTH || y < 0 || y >= SHEET_HEIGHT) return;
    const key = coordKey(x, y);
    if (colour === 0) {
      if (this.spritesMap.has(key)) this.spritesMap.delete(key);
    } else this.spritesMap.set(key, colour & 0xf);
  }

  /** Batch pixel writes into one transaction (one undo step, one network update). */
  transact(fn: () => void, origin: unknown = LOCAL_ORIGIN): void {
    this.doc.transact(fn, origin);
  }

  onPixelsChange(l: (changes: PixelChange[]) => void): Unsubscribe {
    this.pixelListeners.add(l);
    return () => this.pixelListeners.delete(l);
  }

  spriteOrigin(index: number): { x: number; y: number } {
    return {
      x: (index % SPRITES_PER_ROW) * SPRITE_SIZE,
      y: Math.floor(index / SPRITES_PER_ROW) * SPRITE_SIZE,
    };
  }

  isSpriteEmpty(index: number): boolean {
    const { x: ox, y: oy } = this.spriteOrigin(index);
    for (let y = 0; y < SPRITE_SIZE; y++)
      for (let x = 0; x < SPRITE_SIZE; x++)
        if (this.sheet[(oy + y) * SHEET_WIDTH + ox + x] !== 0) return false;
    return true;
  }

  // ---- flags ----------------------------------------------------------------

  getFlag(index: number): number {
    return this.flags[index] ?? 0;
  }

  getFlagBit(index: number, bit: number): boolean {
    return ((this.flags[index] ?? 0) >> bit) & 1 ? true : false;
  }

  setFlag(index: number, value: number): void {
    if (index < 0 || index >= SPRITE_COUNT) return;
    const key = String(index);
    const v = value & 0xff;
    if (v === 0) {
      if (this.flagsMap.has(key)) this.flagsMap.delete(key);
    } else this.flagsMap.set(key, v);
  }

  onFlagsChange(l: () => void): Unsubscribe {
    this.flagListeners.add(l);
    return () => this.flagListeners.delete(l);
  }

  // ---- map ------------------------------------------------------------------

  getTile(x: number, y: number): number {
    if (x < 0 || x >= MAP_WIDTH || y < 0 || y >= MAP_HEIGHT) return 0;
    return this.tiles[y * MAP_WIDTH + x] ?? 0;
  }

  setTile(x: number, y: number, sprite: number): void {
    if (x < 0 || x >= MAP_WIDTH || y < 0 || y >= MAP_HEIGHT) return;
    const key = coordKey(x, y);
    if (sprite === 0) {
      if (this.tilesMap.has(key)) this.tilesMap.delete(key);
    } else this.tilesMap.set(key, sprite & 0xff);
  }

  onTilesChange(l: (changes: TileChange[]) => void): Unsubscribe {
    this.tileListeners.add(l);
    return () => this.tileListeners.delete(l);
  }

  // ---- code -----------------------------------------------------------------

  get files(): CodeFile[] {
    const out: CodeFile[] = [];
    this.codeFiles.forEach((f, id) => {
      const text = f.get('text');
      if (!(text instanceof Y.Text)) return;
      out.push({
        id,
        name: typeof f.get('name') === 'string' ? (f.get('name') as string) : id,
        order: Number(f.get('order') ?? 0),
        text,
      });
    });
    return out.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  }

  get entryFile(): CodeFile | undefined {
    const files = this.files;
    const entryId = this.codeMeta.get('entry');
    return (
      files.find((f) => f.id === entryId) ?? files.find((f) => f.name === MAIN_FILE) ?? files[0]
    );
  }

  /**
   * `id` is only passed when the key has to be reproducible across clients — the entry file, so a
   * concurrent seed converges instead of merging into two `main.lua`. Everything else gets a UUID.
   */
  addFile(name: string, source = '', id: string = crypto.randomUUID()): CodeFile {
    const order = this.files.reduce((m, f) => Math.max(m, f.order), -1) + 1;
    this.doc.transact(() => {
      const f = new Y.Map<unknown>();
      const text = new Y.Text();
      this.codeFiles.set(id, f);
      f.set('name', name);
      f.set('order', order);
      f.set('text', text);
      if (source) text.insert(0, source);
      if (!this.codeMeta.has('entry') && name === MAIN_FILE) this.codeMeta.set('entry', id);
    }, LOCAL_ORIGIN);
    return { id, name, order, text: this.codeFiles.get(id)?.get('text') as Y.Text };
  }

  renameFile(id: string, name: string): void {
    this.codeFiles.get(id)?.set('name', name);
  }

  removeFile(id: string): void {
    if (this.files.length <= 1) return;
    this.doc.transact(() => {
      this.codeFiles.delete(id);
      if (this.codeMeta.get('entry') === id) this.codeMeta.delete('entry');
    }, LOCAL_ORIGIN);
  }

  /** Sources keyed by module name (file name without .lua) — what the VM loads. */
  sources(): { entry: string; modules: Map<string, string>; entryName: string } {
    const modules = new Map<string, string>();
    let entry = '';
    let entryName = MAIN_FILE;
    const e = this.entryFile;
    for (const f of this.files) {
      const src = f.text.toString();
      if (f.id === e?.id) {
        entry = src;
        entryName = f.name;
      } else modules.set(f.name.replace(/\.lua$/i, ''), src);
    }
    return { entry, modules, entryName };
  }

  // ---- sound ----------------------------------------------------------------

  private parseMap<T>(map: Y.Map<string>): Map<string, T> {
    const out = new Map<string, T>();
    map.forEach((v, k) => {
      try {
        out.set(k, JSON.parse(v) as T);
      } catch {
        /* ignore corrupt entry */
      }
    });
    return out;
  }

  getInstruments(): Map<string, Instrument> {
    const out = this.parseMap<Instrument>(this.instruments);
    // Instruments saved before detune/glide existed decode without them; the synth does arithmetic
    // on both every sample, so fill them in here rather than guarding at each use.
    for (const [, i] of out) {
      i.detune ??= 0;
      i.glide ??= 0;
    }
    return out;
  }
  getPatterns(): Map<string, Pattern> {
    return this.parseMap<Pattern>(this.patterns);
  }
  getSongs(): Map<string, Song> {
    return this.parseMap<Song>(this.songs);
  }
  /** sfx slot ("0".."15") → pattern id */
  getSfxSlots(): Map<string, string> {
    const out = new Map<string, string>();
    this.sfx.forEach((v, k) => out.set(k, v));
    return out;
  }
  setInstrument(i: Instrument): void {
    this.instruments.set(i.id, JSON.stringify(i));
  }
  setPattern(p: Pattern): void {
    this.patterns.set(p.id, JSON.stringify(p));
  }
  setSong(slot: number, s: Song): void {
    this.songs.set(String(slot), JSON.stringify(s));
  }

  // ---- versions -------------------------------------------------------------

  /**
   * Puts a saved snapshot back, as content rather than as history.
   *
   * `Y.applyUpdate` cannot do this, and the editor spent its whole life believing it could. A
   * version blob is `encodeStateAsUpdate` of *this same document* at an earlier moment, so every
   * operation it carries is already in this document: applying it back is, by the CRDT's own
   * rules, a no-op. Restoring a version reported success and changed nothing.
   *
   * So a restore is written as ordinary edits — which is also what makes it reach everyone else in
   * the session, land in the undo stack, and autosave like any other change. Only the differences
   * are written, so restoring a version that only touched code does not rewrite 16k map cells.
   */
  restoreFrom(update: Uint8Array): void {
    const scratch = new Y.Doc();
    Y.applyUpdate(scratch, update);
    const from = new Game(scratch);
    try {
      this.doc.transact(() => {
        replaceMap(this.meta, from.meta);
        replaceMap(this.codeMeta, from.codeMeta);
        replaceMap(this.spritesMap, from.spritesMap);
        replaceMap(this.flagsMap, from.flagsMap);
        replaceMap(this.tilesMap, from.tilesMap);
        replaceMap(this.instruments, from.instruments);
        replaceMap(this.patterns, from.patterns);
        replaceMap(this.sfx, from.sfx);
        replaceMap(this.songs, from.songs);
        replaceMap(this.samples, from.samples);
        replaceMap(this.netPermissions, from.netPermissions);
        replaceArray(this.paletteArray, from.paletteArray);
        this.restoreFiles(from);
        for (const key of RESTORED_TEXTS) {
          replaceText(this.doc.getText(key), scratch.getText(key).toString());
        }
      }, LOCAL_ORIGIN);
    } finally {
      scratch.destroy();
    }
  }

  /** Files are maps of maps holding a `Y.Text`, so they cannot be copied by value. */
  private restoreFiles(from: Game): void {
    for (const id of [...this.codeFiles.keys()]) {
      if (!from.codeFiles.has(id)) this.codeFiles.delete(id);
    }
    from.codeFiles.forEach((source, id) => {
      let target = this.codeFiles.get(id);
      if (!target) {
        target = new Y.Map<unknown>();
        this.codeFiles.set(id, target);
        target.set('text', new Y.Text());
      }
      const name = source.get('name');
      const order = source.get('order');
      if (target.get('name') !== name) target.set('name', name);
      if (target.get('order') !== order) target.set('order', order);
      const text = target.get('text');
      const wanted = source.get('text');
      if (text instanceof Y.Text && wanted instanceof Y.Text) {
        replaceText(text, wanted.toString());
      }
    });
  }

  // ---- seeding --------------------------------------------------------------

  /** Fills an empty document with the starter game. Idempotent. */
  seedDefaults(): void {
    this.doc.transact(() => {
      if (!this.meta.has('schemaVersion')) {
        this.meta.set('schemaVersion', GAME_SCHEMA_VERSION);
        this.meta.set('compat', false);
      }
      if (this.paletteArray.length !== PALETTE_SIZE) {
        this.paletteArray.delete(0, this.paletteArray.length);
        this.paletteArray.insert(0, [...BUBBLEGUM_16]);
      }
      if (this.files.length === 0) {
        this.addFile(MAIN_FILE, DEFAULT_GAME_CODE, MAIN_FILE_ID);
        if (DEFAULT_PLAYER_SPRITE_INDICES.every((i) => this.isSpriteEmpty(i)))
          this.seedDefaultSprite(DEFAULT_SPRITE_COLOUR);
      }
      this.dedupeEntryFile();
    }, LOCAL_ORIGIN);
  }

  /**
   * Repairs a document seeded twice before {@link MAIN_FILE_ID} existed.
   *
   * Conservative on purpose: it keeps whichever `main.lua` holds the most text and drops the others
   * only when they are empty or hold exactly the same source. A duplicate that somehow diverged is
   * left alone and renamed out of the way, because losing a line of someone's Lua to a tidy-up is
   * worse than an odd file name.
   */
  private dedupeEntryFile(): void {
    const mains = this.files.filter((f) => f.name === MAIN_FILE);
    if (mains.length < 2) return;
    const keep = mains.reduce((a, b) => (b.text.length > a.text.length ? b : a));
    const kept = keep.text.toString();
    for (const f of mains) {
      if (f.id === keep.id) continue;
      const source = f.text.toString();
      if (source === '' || source === kept) this.codeFiles.delete(f.id);
      else this.codeFiles.get(f.id)?.set('name', `main.recovered-${f.id.slice(0, 6)}.lua`);
    }
    this.codeMeta.set('entry', keep.id);
  }

  seedDefaultSprite(colour: number): void {
    const quads: [number, number, number][] = [
      [1, 0, 0],
      [2, 8, 0],
      [17, 0, 8],
      [18, 8, 8],
    ];
    for (const [index, sx, sy] of quads) {
      const o = this.spriteOrigin(index);
      for (let y = 0; y < SPRITE_SIZE; y++)
        for (let x = 0; x < SPRITE_SIZE; x++)
          if (DEFAULT_PLAYER_SPRITE[sy + y]?.[sx + x] === 'a')
            this.setPixel(o.x + x, o.y + y, colour);
    }
  }
}
