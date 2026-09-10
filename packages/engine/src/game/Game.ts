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
import { GameMap } from './GameMap';
import {
  clampMapSize,
  clampSheetSize,
  type Geometry,
  GEOMETRY_KEYS,
  readGeometry,
} from './geometry';
import {
  FIRST_MAP_ID,
  FIRST_SHEET_ID,
  GAME_SCHEMA_VERSION,
  KEYS,
  MAIN_FILE,
  MAIN_FILE_ID,
  PALETTE_SIZE,
  SPRITE_SIZE,
} from './keys';
import { Sheet } from './Sheet';

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
  /** Palette slot this file is labelled with, or null when it takes none. */
  colour: number | null;
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

interface SheetMirror {
  pixels: Uint8Array;
  flags: Uint8Array;
}

/** What the first sheet and the first map are called before anybody renames them. */
const MAIN_SHEET = 'sheet 1';
const MAIN_MAP = 'map 1';

function numberOf(entry: Y.Map<unknown>, key: string, fallback: number): number {
  const v = entry.get(key);

  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function stringOf(entry: Y.Map<unknown>, key: string, fallback: string): string {
  const v = entry.get(key);

  return typeof v === 'string' ? v : fallback;
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
  /**
   * The sheets and the maps a game has, beyond the first of each.
   *
   * The first entry of either names the content already under `gfx.sprites`, `gfx.flags` and
   * `map.tiles` rather than holding its own -- see {@link FIRST_SHEET_ID}.
   */
  readonly sheetsMap: Y.Map<Y.Map<unknown>>;
  readonly mapsMap: Y.Map<Y.Map<unknown>>;
  readonly instruments: Y.Map<string>;
  readonly patterns: Y.Map<string>;
  readonly sfx: Y.Map<string>;
  readonly songs: Y.Map<string>;
  readonly samples: Y.Map<string>;
  readonly netPermissions: Y.Map<{ flags: number }>;

  /**
   * Palette indices, row-major, one byte a pixel.
   *
   * Reallocated when the sheet is resized, so hold `game.sheet` for the length of a draw and no
   * longer -- a reference kept across a resize points at the old size.
   */
  sheet: Uint8Array;
  /** One byte of flags per sprite. */
  flags: Uint8Array;
  /**
   * Sprite numbers, row-major, one per tile.
   *
   * Sixteen bits rather than eight: a sheet may hold more than 256 sprites, and a tile that could
   * not name them would put most of a sheet out of a map's reach.
   */
  tiles: Uint16Array;

  private _geometry: Geometry;
  private readonly geometryListeners = new Set<() => void>();
  private readonly sheetMirrors = new Map<string, SheetMirror>();
  private readonly mapMirrors = new Map<string, Uint16Array>();

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
    this.sheetsMap = doc.getMap(KEYS.sheets);
    this.mapsMap = doc.getMap(KEYS.maps);
    this.instruments = doc.getMap(KEYS.instruments);
    this.patterns = doc.getMap(KEYS.patterns);
    this.sfx = doc.getMap(KEYS.sfx);
    this.songs = doc.getMap(KEYS.songs);
    this.samples = doc.getMap(KEYS.samples);
    this.netPermissions = doc.getMap(KEYS.netPermissions);

    this._geometry = readGeometry(this.meta);
    this.sheet = new Uint8Array(this._geometry.sheetWidth * this._geometry.sheetHeight);
    this.flags = new Uint8Array(this._geometry.spriteCount);
    this.tiles = new Uint16Array(this._geometry.mapWidth * this._geometry.mapHeight);
    this.hydrate();

    // A size is the shape of every mirror above, so a peer changing one has to be caught here
    // rather than left to whoever happens to read next.
    this.meta.observe((e) => {
      const sized = Object.values(GEOMETRY_KEYS).some((k) => e.changes.keys.has(k));
      if (sized) this.applyGeometry();
    });

    this.spritesMap.observe((e) => {
      const changes: PixelChange[] = [];
      const { sheetWidth, sheetHeight } = this._geometry;
      e.changes.keys.forEach((_c, key) => {
        const [x, y] = parseCoord(key);
        if (x < 0 || x >= sheetWidth || y < 0 || y >= sheetHeight) return;
        const colour = (this.spritesMap.get(key) ?? 0) & 0xf;
        this.sheet[y * sheetWidth + x] = colour;
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
        if (i >= 0 && i < this._geometry.spriteCount)
          this.flags[i] = (this.flagsMap.get(key) ?? 0) & 0xff;
      });
      this.flagListeners.forEach((l) => {
        l();
      });
    });
    this.tilesMap.observe((e) => {
      const changes: TileChange[] = [];
      const { mapWidth, mapHeight } = this._geometry;
      e.changes.keys.forEach((_c, key) => {
        const [x, y] = parseCoord(key);
        if (x < 0 || x >= mapWidth || y < 0 || y >= mapHeight) return;
        const sprite = (this.tilesMap.get(key) ?? 0) & 0xffff;
        this.tiles[y * mapWidth + x] = sprite;
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

  // ---- sheets and maps ------------------------------------------------------

  /** Entries of a collection, sorted the way code files are: by order, then by name. */
  private orderedEntries(from: Y.Map<Y.Map<unknown>>): [string, Y.Map<unknown>][] {
    const out: [string, Y.Map<unknown>][] = [];
    from.forEach((entry, id) => {
      out.push([id, entry]);
    });

    return out.sort(
      (a, b) => numberOf(a[1], 'order', 0) - numberOf(b[1], 'order', 0) || a[0].localeCompare(b[0]),
    );
  }

  /**
   * The live pixel and flag mirrors of one sheet, made on first ask and reshaped when it resizes.
   *
   * The first sheet's are the game's own, because its content never moved out of the roots it has
   * always lived in.
   */
  private sheetMirror(id: string, width: number, height: number): SheetMirror {
    if (id === FIRST_SHEET_ID) return { pixels: this.sheet, flags: this.flags };
    const held = this.sheetMirrors.get(id);
    const count = (width / SPRITE_SIZE) * (height / SPRITE_SIZE);
    if (held?.pixels.length === width * height) return held;

    const made: SheetMirror = {
      pixels: new Uint8Array(width * height),
      flags: new Uint8Array(count),
    };
    const entry = this.sheetsMap.get(id);
    const pixels = entry?.get('pixels');
    if (pixels instanceof Y.Map)
      (pixels as Y.Map<number>).forEach((v, k) => {
        const [x, y] = parseCoord(k);
        if (x >= 0 && x < width && y >= 0 && y < height) made.pixels[y * width + x] = v & 0xf;
      });
    const flags = entry?.get('flags');
    if (flags instanceof Y.Map)
      (flags as Y.Map<number>).forEach((v, k) => {
        const i = Number(k);
        if (i >= 0 && i < count) made.flags[i] = v & 0xff;
      });
    this.sheetMirrors.set(id, made);

    return made;
  }

  private mapMirror(id: string, width: number, height: number): Uint16Array {
    if (id === FIRST_MAP_ID) return this.tiles;
    const held = this.mapMirrors.get(id);
    if (held?.length === width * height) return held;

    const made = new Uint16Array(width * height);
    const tiles = this.mapsMap.get(id)?.get('tiles');
    if (tiles instanceof Y.Map)
      (tiles as Y.Map<number>).forEach((v, k) => {
        const [x, y] = parseCoord(k);
        if (x >= 0 && x < width && y >= 0 && y < height) made[y * width + x] = v & 0xffff;
      });
    this.mapMirrors.set(id, made);

    return made;
  }

  /**
   * Every sheet, in order, with its sprite numbers already worked out.
   *
   * A document that names none is a game from before a game could have several: it has exactly the
   * one sheet, at the size its geometry records, and this says so rather than making the callers
   * check.
   */
  get sheets(): Sheet[] {
    const { sheetWidth, sheetHeight } = this._geometry;
    const entries = this.orderedEntries(this.sheetsMap);
    if (entries.length === 0)
      return [
        new Sheet(
          FIRST_SHEET_ID,
          MAIN_SHEET,
          0,
          sheetWidth,
          sheetHeight,
          0,
          this.sheet,
          this.flags,
        ),
      ];

    let base = 0;
    return entries.map(([id, e], i) => {
      const width = clampSheetSize(numberOf(e, 'w', sheetWidth));
      const height = clampSheetSize(numberOf(e, 'h', sheetHeight));
      const mirror = this.sheetMirror(id, width, height);
      const sheet = new Sheet(
        id,
        stringOf(e, 'name', id),
        numberOf(e, 'order', i),
        width,
        height,
        base,
        mirror.pixels,
        mirror.flags,
      );
      base += sheet.count;
      return sheet;
    });
  }

  get maps(): GameMap[] {
    const { mapWidth, mapHeight } = this._geometry;
    const entries = this.orderedEntries(this.mapsMap);
    if (entries.length === 0)
      return [new GameMap(FIRST_MAP_ID, MAIN_MAP, 0, mapWidth, mapHeight, this.tiles)];

    return entries.map(([id, e], i) => {
      const width = clampMapSize(numberOf(e, 'w', mapWidth));
      const height = clampMapSize(numberOf(e, 'h', mapHeight));
      return new GameMap(
        id,
        stringOf(e, 'name', id),
        numberOf(e, 'order', i),
        width,
        height,
        this.mapMirror(id, width, height),
      );
    });
  }

  /** Which sheet answers to a sprite number, or nothing where the number names no cell. */
  sheetOf(sprite: number): Sheet | undefined {
    return this.sheets.find((s) => s.holds(sprite));
  }

  /** One past the highest sprite number any sheet claims. */
  get spriteTotal(): number {
    return this.sheets.reduce((n, s) => n + s.count, 0);
  }

  // ---- geometry -------------------------------------------------------------

  /** How big this game's sheet and map are. Read it per use; a resize replaces it. */
  get geometry(): Geometry {
    return this._geometry;
  }

  onGeometryChange(fn: () => void): () => void {
    this.geometryListeners.add(fn);
    return () => this.geometryListeners.delete(fn);
  }

  /**
   * Fills the mirrors from the document, dropping anything outside the current size.
   *
   * Dropping rather than refusing: a document written at a larger size and opened at a smaller one
   * is not corrupt, it is a document this reader can only show part of -- and since nothing here
   * writes back, the rest survives untouched in the document.
   */
  private hydrate(): void {
    const { sheetWidth, sheetHeight, spriteCount, mapWidth, mapHeight } = this._geometry;
    this.spritesMap.forEach((v, k) => {
      const [x, y] = parseCoord(k);
      if (x >= 0 && x < sheetWidth && y >= 0 && y < sheetHeight)
        this.sheet[y * sheetWidth + x] = v & 0xf;
    });
    this.flagsMap.forEach((v, k) => {
      const i = Number(k);
      if (i >= 0 && i < spriteCount) this.flags[i] = v & 0xff;
    });
    this.tilesMap.forEach((v, k) => {
      const [x, y] = parseCoord(k);
      if (x >= 0 && x < mapWidth && y >= 0 && y < mapHeight)
        this.tiles[y * mapWidth + x] = v & 0xffff;
    });
  }

  /** Reshapes the mirrors around a size the document now states, and says so. */
  private applyGeometry(): void {
    const next = readGeometry(this.meta);
    if (
      next.sheetWidth === this._geometry.sheetWidth &&
      next.sheetHeight === this._geometry.sheetHeight &&
      next.mapWidth === this._geometry.mapWidth &&
      next.mapHeight === this._geometry.mapHeight
    )
      return;

    this._geometry = next;
    this.sheet = new Uint8Array(next.sheetWidth * next.sheetHeight);
    this.flags = new Uint8Array(next.spriteCount);
    this.tiles = new Uint16Array(next.mapWidth * next.mapHeight);
    this.hydrate();
    this.geometryListeners.forEach((l) => {
      l();
    });
  }

  /**
   * Records a new size. Pixels and tiles outside it stay in the document but stop being reachable,
   * so growing back finds them again -- which is what makes a mis-click survivable.
   */
  resize(size: {
    sheetWidth?: number;
    sheetHeight?: number;
    mapWidth?: number;
    mapHeight?: number;
  }): void {
    this.doc.transact(() => {
      const set = (key: string, value: number | undefined, clamp: (n: number) => number): void => {
        if (value !== undefined) this.meta.set(key, clamp(value));
      };
      set(GEOMETRY_KEYS.sheetWidth, size.sheetWidth, clampSheetSize);
      set(GEOMETRY_KEYS.sheetHeight, size.sheetHeight, clampSheetSize);
      set(GEOMETRY_KEYS.mapWidth, size.mapWidth, clampMapSize);
      set(GEOMETRY_KEYS.mapHeight, size.mapHeight, clampMapSize);
    }, LOCAL_ORIGIN);
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
    const { sheetWidth, sheetHeight } = this._geometry;
    if (x < 0 || x >= sheetWidth || y < 0 || y >= sheetHeight) return 0;
    return this.sheet[y * sheetWidth + x] ?? 0;
  }

  setPixel(x: number, y: number, colour: number): void {
    const { sheetWidth, sheetHeight } = this._geometry;
    if (x < 0 || x >= sheetWidth || y < 0 || y >= sheetHeight) return;
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

  /**
   * Where a sprite number starts, on the sheet that answers to it.
   *
   * The one authority on how a number becomes a position: the renderer and both editors used to
   * each carry their own copy of this arithmetic, and four copies are four chances to disagree the
   * day a number no longer names a place on one fixed sheet.
   *
   * A number no sheet claims lands at the origin of the first, which is what every caller did with
   * an out-of-range number before there was anywhere else for one to be.
   */
  spriteOrigin(index: number): { x: number; y: number } {
    const sheet = this.sheetOf(index);

    return sheet ? sheet.originOf(index) : { x: 0, y: 0 };
  }

  isSpriteEmpty(index: number): boolean {
    return this.sheetOf(index)?.isEmpty(index) ?? true;
  }

  // ---- flags ----------------------------------------------------------------

  getFlag(index: number): number {
    return this.flags[index] ?? 0;
  }

  getFlagBit(index: number, bit: number): boolean {
    return ((this.flags[index] ?? 0) >> bit) & 1 ? true : false;
  }

  setFlag(index: number, value: number): void {
    if (index < 0 || index >= this._geometry.spriteCount) return;
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
    const { mapWidth, mapHeight } = this._geometry;
    if (x < 0 || x >= mapWidth || y < 0 || y >= mapHeight) return 0;
    return this.tiles[y * mapWidth + x] ?? 0;
  }

  setTile(x: number, y: number, sprite: number): void {
    const { mapWidth, mapHeight } = this._geometry;
    if (x < 0 || x >= mapWidth || y < 0 || y >= mapHeight) return;
    const key = coordKey(x, y);
    if (sprite === 0) {
      if (this.tilesMap.has(key)) this.tilesMap.delete(key);
    } else this.tilesMap.set(key, sprite & 0xffff);
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
        colour: typeof f.get('colour') === 'number' ? (f.get('colour') as number) : null,
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
   * concurrent seed converges instead of merging into two entries. Everything else gets a UUID.
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
    return { id, name, order, colour: null, text: this.codeFiles.get(id)?.get('text') as Y.Text };
  }

  renameFile(id: string, name: string): void {
    this.codeFiles.get(id)?.set('name', name);
  }

  /**
   * Ids first to last; anything not named keeps its place after them.
   *
   * One transaction rather than one write per file: the order decides what runs when, so every
   * observer downstream reloads the game on it, and N writes would mean N reloads of an order that
   * was only ever moved once.
   */
  reorderFiles(ids: readonly string[]): void {
    const ranked = new Map(ids.map((id, i) => [id, i]));
    const rest = this.files.filter((f) => !ranked.has(f.id));
    this.doc.transact(() => {
      ids.forEach((id, i) => this.codeFiles.get(id)?.set('order', i));
      rest.forEach((f, i) => this.codeFiles.get(f.id)?.set('order', ids.length + i));
    }, LOCAL_ORIGIN);
  }

  setFileColour(id: string, colour: number | null): void {
    const f = this.codeFiles.get(id);
    if (!f) return;
    if (colour === null) f.delete('colour');
    else f.set('colour', colour);
  }

  removeFile(id: string): void {
    if (this.files.length <= 1) return;
    this.doc.transact(() => {
      this.codeFiles.delete(id);
      if (this.codeMeta.get('entry') === id) this.codeMeta.delete('entry');
    }, LOCAL_ORIGIN);
  }

  /**
   * Every file's source in the order the tabs are in — which is the order they are evaluated.
   *
   * A file's name is also the name anything asking for it by name would use.
   */
  sources(): { name: string; source: string }[] {
    return this.files.map((f) => ({ name: f.name, source: f.text.toString() }));
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
      // Saved when the arpeggio carried its own list of intervals, an empty list was what "off"
      // meant and the rate said nothing on its own. The rate is the whole switch now, so one of
      // those instruments would arpeggiate every chord under it if we took the rate at face value.
      const legacy = (i.arp as { steps?: unknown }).steps;
      if (Array.isArray(legacy) && legacy.length === 0) i.arp = { rate: 0 };
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
   * Conservative on purpose: it keeps whichever entry holds the most text and drops the others
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
      else this.codeFiles.get(f.id)?.set('name', `main recovered ${f.id.slice(0, 6)}`);
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
