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
import { GameMap, type MapWriter } from './GameMap';
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
import { remapSprites, rewriteSpriteNumbers, survives } from './renumber';
import { Sheet, type SheetShape, type SheetWriter } from './Sheet';

/** A number that names no cell any more. Not a sprite anybody can draw, so nothing keeps it. */
const NOT_A_SPRITE = -1;

/**
 * Fallbacks the accessors return for a game with no sheet or map, so they state a length rather
 * than an optional.
 */
const NO_PIXELS = new Uint8Array(0);
const NO_TILES = new Uint16Array(0);

/** What named a sprite by number before the sizes moved. */
interface HeldNumbers {
  flags: { id: string; base: number; values: number[] }[];
  /** Every map's tiles, with the width they were laid out at. */
  tiles: { id: string; width: number; values: number[] }[];
}

/** What a resize would move, and what it would cost. */
export interface ResizePreview {
  /** Sprite numbers that would come to mean a different cell. */
  moves: number;
  /** Map tiles that name one of them. */
  tiles: number;
  /** Calls in the project's code that would be rewritten. */
  calls: number;
  /** Calls that name a sprite through something other than a plain number, so nothing can follow. */
  unsure: number;
  /** Cells with something drawn on them that would fall outside the new shape. */
  lost: number;
}

export interface PixelChange {
  /** Which sheet the pixel is on. */
  sheet: string;
  x: number;
  y: number;
  colour: number;
}
export interface TileChange {
  /** Which map the tile is on. */
  map: string;
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

/**
 * A sheet's cells as typed arrays, with the shape they were built at, since equal lengths can be
 * different shapes.
 */
interface SheetMirror {
  pixels: Uint8Array;
  flags: Uint8Array;
  width: number;
  height: number;
}

interface MapMirror {
  tiles: Uint16Array;
  width: number;
  height: number;
}

function numberOf(entry: Y.Map<unknown>, key: string, fallback: number): number {
  const v = entry.get(key);

  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function colourOf(entry: Y.Map<unknown>): number | null {
  const v = entry.get('colour');

  return typeof v === 'number' ? v : null;
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
   * Palette indices of the first sheet, row-major, one byte a pixel; replaced on resize, so hold it
   * no longer than a draw.
   */
  get sheet(): Uint8Array {
    return this.sheets[0]?.pixels ?? NO_PIXELS;
  }

  /** One byte of flags per sprite, for the first sheet. */
  get flags(): Uint8Array {
    return this.sheets[0]?.flags ?? NO_PIXELS;
  }

  /**
   * Sprite numbers of the first map, row-major, sixteen bits so a tile can name any sprite past
   * 255.
   */
  get tiles(): Uint16Array {
    return this.maps[0]?.tiles ?? NO_TILES;
  }

  private _geometry: Geometry;
  private readonly geometryListeners = new Set<() => void>();
  private readonly collectionListeners = new Set<() => void>();
  private readonly sheetMirrors = new Map<string, SheetMirror>();
  /** The projections as last built, or null once the document has moved under them. */
  private sheetsHeld: Sheet[] | null = null;
  private mapsHeld: GameMap[] | null = null;
  /**
   * How a Sheet reaches the document, kept apart from Game's own setPixel and setFlag, which only
   * write the first sheet.
   */
  private readonly sheetWriter: SheetWriter = {
    setPixel: (id, x, y, colour) => {
      this.writeSheetPixel(id, x, y, colour);
    },
    setFlag: (id, local, value) => {
      this.writeSheetFlag(id, local, value);
    },
  };
  private readonly mapMirrors = new Map<string, MapMirror>();
  private readonly mapWriter: MapWriter = {
    setTile: (id, x, y, sprite) => {
      this.writeMapTile(id, x, y, sprite);
    },
  };
  /** Cell maps already watched, so a second pass over the collection does not double up. */
  private readonly watchedCells = new WeakSet<Y.Map<number>>();
  private readonly unobservers: (() => void)[] = [];

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

    this.attachSheetObservers();
    this.attachMapObservers();
    // Sheets a peer adds arrive after this constructor, and their cells need watching too.
    const told = (): void => {
      this.collectionListeners.forEach((l) => {
        l();
      });
    };
    const onSheets = (): void => {
      this.forgetProjections();
      this.attachSheetObservers();
      told();
    };
    const onMaps = (): void => {
      this.forgetProjections();
      this.attachMapObservers();
      told();
    };
    // A size is the shape of every mirror, so a peer's resize is applied as it arrives.
    const onMeta = (e: Y.YMapEvent<unknown>): void => {
      const sized = Object.values(GEOMETRY_KEYS).some((k) => e.changes.keys.has(k));
      if (sized) this.applyGeometry();
    };
    const onPalette = (): void => {
      this.paletteListeners.forEach((l) => {
        l();
      });
    };
    this.sheetsMap.observeDeep(onSheets);
    this.mapsMap.observeDeep(onMaps);
    this.meta.observe(onMeta);
    this.paletteArray.observe(onPalette);
    this.unobservers.push(
      () => {
        this.sheetsMap.unobserveDeep(onSheets);
      },
      () => {
        this.mapsMap.unobserveDeep(onMaps);
      },
      () => {
        this.meta.unobserve(onMeta);
      },
      () => {
        this.paletteArray.unobserve(onPalette);
      },
    );
  }

  /** Detaches this view from the document, which outlives it; the view is not to be used after. */
  destroy(): void {
    for (const off of this.unobservers.splice(0)) off();
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
   * The live pixel and flag mirrors of one sheet, made on first ask and rebuilt on resize, dropping
   * cells outside the shape.
   */
  private sheetMirror(id: string, size: { width: number; height: number }): SheetMirror {
    const { width, height } = size;
    const held = this.sheetMirrors.get(id);
    if (held?.width === width && held.height === height) return held;

    const count = (width / SPRITE_SIZE) * (height / SPRITE_SIZE);
    const made: SheetMirror = {
      pixels: new Uint8Array(width * height),
      flags: new Uint8Array(count),
      width,
      height,
    };
    this.cellsOf(id, 'pixels')?.forEach((v, k) => {
      const [x, y] = parseCoord(k);
      if (x >= 0 && x < width && y >= 0 && y < height) made.pixels[y * width + x] = v & 0xf;
    });
    this.cellsOf(id, 'flags')?.forEach((v, k) => {
      const i = Number(k);
      if (i >= 0 && i < count) made.flags[i] = v & 0xff;
    });
    this.sheetMirrors.set(id, made);

    return made;
  }

  private mapMirror(id: string, size: { width: number; height: number }): MapMirror {
    const { width, height } = size;
    const held = this.mapMirrors.get(id);
    if (held?.width === width && held.height === height) return held;

    const made: MapMirror = { tiles: new Uint16Array(width * height), width, height };
    this.mapCellsOf(id)?.forEach((v, k) => {
      const [x, y] = parseCoord(k);
      if (x >= 0 && x < width && y >= 0 && y < height) made.tiles[y * width + x] = v & 0xffff;
    });
    this.mapMirrors.set(id, made);

    return made;
  }

  /** Drops the held projections, so the next read builds them from the document. */
  private forgetProjections(): void {
    this.sheetsHeld = null;
    this.mapsHeld = null;
  }

  /**
   * Every sheet, in order, with its sprite numbers worked out; held between document changes, so
   * inside a local transaction it answers as of before the write.
   */
  get sheets(): Sheet[] {
    if (this.sheetsHeld) return this.sheetsHeld;
    let base = 0;

    return (this.sheetsHeld = this.entriesOrDefault(this.sheetsMap, FIRST_SHEET_ID).map(
      ([id, e], i) => {
        const { width, height } = this.sizeOf(id);
        const mirror = this.sheetMirror(id, { width, height });
        const sheet = new Sheet(
          id,
          stringOf(e, 'name', ''),
          numberOf(e, 'order', i),
          width,
          height,
          base,
          colourOf(e),
          mirror.pixels,
          mirror.flags,
          this.sheetWriter,
        );
        base += sheet.count;

        return sheet;
      },
    ));
  }

  get maps(): GameMap[] {
    if (this.mapsHeld) return this.mapsHeld;

    return (this.mapsHeld = this.entriesOrDefault(this.mapsMap, FIRST_MAP_ID).map(([id, e], i) => {
      const { width, height } = this.mapSizeOf(id);

      return new GameMap(
        id,
        stringOf(e, 'name', ''),
        numberOf(e, 'order', i),
        width,
        height,
        colourOf(e),
        this.mapMirror(id, { width, height }).tiles,
        this.mapWriter,
      );
    }));
  }

  /**
   * A collection's entries, or an unwritten empty entry standing in for the first when it declares
   * none.
   */
  private entriesOrDefault(
    from: Y.Map<Y.Map<unknown>>,
    firstId: string,
  ): [string, Y.Map<unknown>][] {
    const entries = this.orderedEntries(from);

    return entries.length ? entries : [[firstId, new Y.Map<unknown>()]];
  }

  /**
   * Where a sheet's cells are, or null where it has none yet; the first sheet's are the document
   * roots, which older builds read.
   */
  private cellsOf(sheetId: string, key: 'pixels' | 'flags'): Y.Map<number> | null {
    if (sheetId === FIRST_SHEET_ID) return key === 'pixels' ? this.spritesMap : this.flagsMap;
    const held = this.sheetsMap.get(sheetId)?.get(key);

    return held instanceof Y.Map ? (held as Y.Map<number>) : null;
  }

  /** Where the first map's tiles are, and where any other map's would be. */
  private mapCellsOf(mapId: string): Y.Map<number> | null {
    if (mapId === FIRST_MAP_ID) return this.tilesMap;
    const held = this.mapsMap.get(mapId)?.get('tiles');

    return held instanceof Y.Map ? (held as Y.Map<number>) : null;
  }

  /** A sheet's size: what its entry states, or the document's geometry where it states none. */
  private sizeOf(sheetId: string): { width: number; height: number } {
    const { sheetWidth, sheetHeight } = this._geometry;
    const entry = this.sheetsMap.get(sheetId);

    return {
      width: clampSheetSize(entry ? numberOf(entry, 'w', sheetWidth) : sheetWidth),
      height: clampSheetSize(entry ? numberOf(entry, 'h', sheetHeight) : sheetHeight),
    };
  }

  /**
   * Writes a sheet's size on its entry, and the first sheet's into the geometry as well, where
   * older builds read it.
   */
  private writeSheetSize(sheetId: string, width: number, height: number): void {
    const w = clampSheetSize(width);
    const h = clampSheetSize(height);
    if (sheetId === FIRST_SHEET_ID) {
      this.declareFirstSheet();
      this.meta.set(GEOMETRY_KEYS.sheetWidth, w);
      this.meta.set(GEOMETRY_KEYS.sheetHeight, h);
    }
    const entry = this.sheetsMap.get(sheetId);
    if (!entry) return;
    entry.set('w', w);
    entry.set('h', h);
  }

  /** The same, for a map. */
  private writeMapSize(mapId: string, width: number, height: number): void {
    const w = clampMapSize(width);
    const h = clampMapSize(height);
    if (mapId === FIRST_MAP_ID) {
      this.declareFirstMap();
      this.meta.set(GEOMETRY_KEYS.mapWidth, w);
      this.meta.set(GEOMETRY_KEYS.mapHeight, h);
    }
    const entry = this.mapsMap.get(mapId);
    if (!entry) return;
    entry.set('w', w);
    entry.set('h', h);
  }

  /** The same, for a map. */
  private mapSizeOf(mapId: string): { width: number; height: number } {
    const { mapWidth, mapHeight } = this._geometry;
    const entry = this.mapsMap.get(mapId);

    return {
      width: clampMapSize(entry ? numberOf(entry, 'w', mapWidth) : mapWidth),
      height: clampMapSize(entry ? numberOf(entry, 'h', mapHeight) : mapHeight),
    };
  }

  /** A sheet's cells, made on first write so an undrawn sheet costs the document nothing. */
  private sheetCells(sheetId: string, key: 'pixels' | 'flags'): Y.Map<number> {
    const held = this.cellsOf(sheetId, key);
    if (held) return held;
    const entry = this.sheetsMap.get(sheetId);
    if (!entry) throw new Error(`no sheet ${sheetId}`);
    const made = new Y.Map<number>();
    entry.set(key, made);

    return made;
  }
  /**
   * A map's cells, made on first write and left unobserved, since Yjs fires no event for a type
   * made and written in one transaction.
   */
  private mapCells(mapId: string): Y.Map<number> {
    const held = this.mapCellsOf(mapId);
    if (held) return held;
    const entry = this.mapsMap.get(mapId);
    if (!entry) throw new Error(`no map ${mapId}`);
    const made = new Y.Map<number>();
    entry.set('tiles', made);

    return made;
  }

  /** Watches the cell maps of every sheet that has any, once each. */
  private attachSheetObservers(): void {
    for (const id of [FIRST_SHEET_ID, ...this.sheetsMap.keys()])
      for (const key of ['pixels', 'flags'] as const) {
        const cells = this.cellsOf(id, key);
        if (!cells || this.watchedCells.has(cells)) continue;
        this.watchedCells.add(cells);
        this.observeSheetCells(id, key, cells);
        this.tellCells(id, key, cells, cells.keys());
      }
  }

  /** The same for the maps, whose tiles the first one keeps at the document's root. */
  private attachMapObservers(): void {
    for (const id of [FIRST_MAP_ID, ...this.mapsMap.keys()]) {
      const cells = this.mapCellsOf(id);
      if (!cells || this.watchedCells.has(cells)) continue;
      this.watchedCells.add(cells);
      this.observeMapCells(id, cells);
      // A cell map made and written in one transaction fired no event, so its tiles are told now.
      this.tellTiles(id, cells, cells.keys());
    }
  }

  /** Brings a sheet's mirror in step with these cells and tells the listeners what moved. */
  private tellCells(
    sheetId: string,
    key: 'pixels' | 'flags',
    cells: Y.Map<number>,
    keys: Iterable<string>,
  ): void {
    const sheet = this.sheets.find((s) => s.id === sheetId);
    if (!sheet) return;
    const changes: PixelChange[] = [];
    for (const k of keys) {
      if (key === 'flags') {
        const i = Number(k);
        if (i >= 0 && i < sheet.count) sheet.flags[i] = (cells.get(k) ?? 0) & 0xff;
        continue;
      }
      const [x, y] = parseCoord(k);
      if (x < 0 || x >= sheet.width || y < 0 || y >= sheet.height) continue;
      const colour = (cells.get(k) ?? 0) & 0xf;
      sheet.pixels[y * sheet.width + x] = colour;
      changes.push({ sheet: sheetId, x, y, colour });
    }
    if (key === 'flags')
      this.flagListeners.forEach((l) => {
        l();
      });
    else if (changes.length)
      this.pixelListeners.forEach((l) => {
        l(changes);
      });
  }

  private observeSheetCells(sheetId: string, key: 'pixels' | 'flags', cells: Y.Map<number>): void {
    const onCells = (e: Y.YMapEvent<number>): void => {
      this.tellCells(sheetId, key, cells, e.changes.keys.keys());
    };
    cells.observe(onCells);
    this.unobservers.push(() => {
      cells.unobserve(onCells);
    });
  }

  /** Brings the mirror in step with these cells and tells the listeners which tiles moved. */
  private tellTiles(mapId: string, cells: Y.Map<number>, keys: Iterable<string>): void {
    const map = this.maps.find((m) => m.id === mapId);
    if (!map) return;
    const changes: TileChange[] = [];
    for (const k of keys) {
      const [x, y] = parseCoord(k);
      if (x < 0 || x >= map.width || y < 0 || y >= map.height) continue;
      const sprite = (cells.get(k) ?? 0) & 0xffff;
      map.tiles[y * map.width + x] = sprite;
      changes.push({ map: mapId, x, y, sprite });
    }
    if (changes.length)
      this.tileListeners.forEach((l) => {
        l(changes);
      });
  }

  /** The tile twin of `observeSheetCells`. */
  private observeMapCells(mapId: string, cells: Y.Map<number>): void {
    const onCells = (e: Y.YMapEvent<number>): void => {
      this.tellTiles(mapId, cells, e.changes.keys.keys());
    };
    cells.observe(onCells);
    this.unobservers.push(() => {
      cells.unobserve(onCells);
    });
  }

  private writeSheetPixel(sheetId: string, x: number, y: number, colour: number): void {
    const cells = this.sheetCells(sheetId, 'pixels');
    const key = coordKey(x, y);
    if (colour === 0) {
      if (cells.has(key)) cells.delete(key);
    } else cells.set(key, colour & 0xf);
  }

  private writeSheetFlag(sheetId: string, local: number, value: number): void {
    const cells = this.sheetCells(sheetId, 'flags');
    const key = String(local);
    const v = value & 0xff;
    if (v === 0) {
      if (cells.has(key)) cells.delete(key);
    } else cells.set(key, v);
  }
  private writeMapTile(mapId: string, x: number, y: number, sprite: number): void {
    const cells = this.mapCells(mapId);
    const key = coordKey(x, y);
    if (sprite === 0) {
      if (cells.has(key)) cells.delete(key);
    } else cells.set(key, sprite & 0xffff);
  }

  /**
   * Adds a sheet after the ones there are, and gives it the numbers that follow theirs.
   *
   * The first call also writes the entry for the sheet that was already there, because a document
   * cannot hold a second sheet without saying what the first one is.
   */
  addSheet(name: string, width: number, height: number, id: string = crypto.randomUUID()): void {
    this.doc.transact(() => {
      this.declareFirstSheet();
      const order = this.sheets.reduce((m, sh) => Math.max(m, sh.order), -1) + 1;
      const entry = new Y.Map<unknown>();
      this.sheetsMap.set(id, entry);
      entry.set('name', name);
      entry.set('order', order);
      entry.set('w', clampSheetSize(width));
      entry.set('h', clampSheetSize(height));
    }, LOCAL_ORIGIN);
  }

  /**
   * What resizing a sheet would cost, without doing it: pixels keep their position, so this sheet's
   * numbers and every later sheet's shift.
   */
  previewResize(id: string, width: number, height: number): ResizePreview {
    const before = this.sheets;
    const after = this.shapesAfterResize(id, width, height);
    const moves = remapSprites(before, after);
    let tiles = 0;
    for (const m of this.maps)
      for (const n of m.tiles)
        if (n !== 0 && (moves.has(n) || !survives(n, before, after))) tiles++;
    let calls = 0;
    let unsure = 0;
    for (const f of this.files) {
      const out = rewriteSpriteNumbers(f.text.toString(), moves);
      calls += out.changed;
      unsure += out.unsure;
    }
    let lost = 0;
    for (const sh of before)
      for (let n = sh.base; n < sh.base + sh.count; n++)
        if (!survives(n, before, after) && !sh.isEmpty(n)) lost++;

    return { moves: moves.size, tiles, calls, unsure, lost };
  }

  /**
   * Resizes a sheet and renumbers what named its sprites, in one transaction so no peer reads a
   * half-renumbered document.
   */
  resizeSheet(id: string, width: number, height: number): void {
    const before = this.sheets;
    if (!before.some((sh) => sh.id === id)) return;
    const after = this.shapesAfterResize(id, width, height);
    const held = this.holdNumbered();
    this.doc.transact(() => {
      this.writeSheetSize(id, width, height);
      this.renumber(before, after, held);
    }, LOCAL_ORIGIN);
  }
  /** Resizes one map; tiles keep their place, so nothing is renumbered. */
  resizeMap(id: string, width: number, height: number): void {
    if (!this.maps.some((m) => m.id === id)) return;
    this.doc.transact(() => {
      this.writeMapSize(id, width, height);
    }, LOCAL_ORIGIN);
  }

  /** Everything that names a sprite by number, copied out before the sizes move. */
  private holdNumbered(): HeldNumbers {
    return {
      flags: this.sheets.map((sh) => ({ id: sh.id, base: sh.base, values: Array.from(sh.flags) })),
      tiles: this.maps.map((m) => ({ id: m.id, width: m.width, values: Array.from(m.tiles) })),
    };
  }

  /**
   * Moves the tiles, the flags and the code onto the new numbers, writing the cells directly since
   * the mirrors still hold the old shape until the transaction ends.
   */
  private renumber(
    before: readonly SheetShape[],
    after: readonly SheetShape[],
    held: HeldNumbers,
  ): void {
    const moves = remapSprites(before, after);
    if (moves.size === 0) return;
    const kept = (n: number): number =>
      moves.get(n) ?? (survives(n, before, after) ? n : NOT_A_SPRITE);

    for (const sh of held.flags) {
      const now = after.find((s) => s.id === sh.id);
      if (!now) continue;
      const cells = (now.width / SPRITE_SIZE) * (now.height / SPRITE_SIZE);
      const next = new Map<number, number>();
      sh.values.forEach((v, local) => {
        if (v === 0) return;
        const to = kept(sh.base + local);
        if (to !== NOT_A_SPRITE) next.set(to - now.base, v);
      });
      const target = this.sheetCells(now.id, 'flags');
      target.forEach((_v, k) => {
        target.delete(k);
      });
      for (let i = 0; i < cells; i++) {
        const v = next.get(i);
        if (v) target.set(String(i), v);
      }
    }

    for (const m of held.tiles) {
      if (!m.values.some((n) => n !== 0)) continue;
      const tiles = this.mapCells(m.id);
      m.values.forEach((n, at) => {
        if (n === 0) return;
        const to = kept(n);
        const key = coordKey(at % m.width, Math.floor(at / m.width));
        if (to === NOT_A_SPRITE || to === 0) tiles.delete(key);
        else tiles.set(key, to & 0xffff);
      });
    }

    for (const f of this.files) {
      const out = rewriteSpriteNumbers(f.text.toString(), moves);
      if (out.changed === 0) continue;
      f.text.delete(0, f.text.length);
      f.text.insert(0, out.text);
    }
  }

  /** The sheets as they would be, in order, if this one took that size. */
  private shapesAfterResize(id: string, width: number, height: number): SheetShape[] {
    let base = 0;

    return this.sheets.map((sh) => {
      const w = sh.id === id ? clampSheetSize(width) : sh.width;
      const h = sh.id === id ? clampSheetSize(height) : sh.height;
      const at = base;
      base += (w / SPRITE_SIZE) * (h / SPRITE_SIZE);

      return {
        id: sh.id,
        name: sh.name,
        order: sh.order,
        colour: sh.colour,
        width: w,
        height: h,
        base: at,
      };
    });
  }

  /** A colour of null takes none, rather than taking slot zero. */
  describeSheet(id: string, name: string, colour: number | null): void {
    this.doc.transact(() => {
      this.declareFirstSheet();
      this.describe(this.sheetsMap, id, name, colour);
    }, LOCAL_ORIGIN);
  }

  describeMap(id: string, name: string, colour: number | null): void {
    this.doc.transact(() => {
      this.declareFirstMap();
      this.describe(this.mapsMap, id, name, colour);
    }, LOCAL_ORIGIN);
  }

  private describe(
    from: Y.Map<Y.Map<unknown>>,
    id: string,
    name: string,
    colour: number | null,
  ): void {
    const entry = from.get(id);
    if (!entry) return;
    this.doc.transact(() => {
      entry.set('name', name);
      if (colour === null) entry.delete('colour');
      else entry.set('colour', colour);
    }, LOCAL_ORIGIN);
  }

  /**
   * Refuses the first sheet, whose cells are the document roots and so cannot go, and renumbers
   * what named the sheets after the removed one, since their numbers shift down onto its own.
   */
  removeSheet(id: string): void {
    if (id === FIRST_SHEET_ID || !this.sheetsMap.has(id)) return;
    const before = this.sheets;
    let base = 0;
    const after: SheetShape[] = before
      .filter((sh) => sh.id !== id)
      .map((sh) => {
        const at = base;
        base += sh.count;

        return {
          id: sh.id,
          name: sh.name,
          order: sh.order,
          colour: sh.colour,
          width: sh.width,
          height: sh.height,
          base: at,
        };
      });
    const held = this.holdNumbered();
    this.doc.transact(() => {
      this.sheetsMap.delete(id);
      this.sheetMirrors.delete(id);
      this.renumber(before, after, held);
    }, LOCAL_ORIGIN);
  }

  addMap(name: string, width: number, height: number, id: string = crypto.randomUUID()): void {
    this.doc.transact(() => {
      this.declareFirstMap();
      const order = this.maps.reduce((m, mp) => Math.max(m, mp.order), -1) + 1;
      const entry = new Y.Map<unknown>();
      this.mapsMap.set(id, entry);
      entry.set('name', name);
      entry.set('order', order);
      entry.set('w', clampMapSize(width));
      entry.set('h', clampMapSize(height));
    }, LOCAL_ORIGIN);
  }

  removeMap(id: string): void {
    if (this.mapsMap.size <= 1) return;
    this.doc.transact(() => {
      this.mapsMap.delete(id);
      this.mapMirrors.delete(id);
    }, LOCAL_ORIGIN);
  }

  /**
   * Writes the entry describing the sheet a document already had, under a fixed key so concurrent
   * clients write the same entry.
   */
  private declareFirstSheet(): void {
    if (this.sheetsMap.size > 0) return;
    const entry = new Y.Map<unknown>();
    this.sheetsMap.set(FIRST_SHEET_ID, entry);
    entry.set('order', 0);
    entry.set('w', this._geometry.sheetWidth);
    entry.set('h', this._geometry.sheetHeight);
  }

  private declareFirstMap(): void {
    if (this.mapsMap.size > 0) return;
    const entry = new Y.Map<unknown>();
    this.mapsMap.set(FIRST_MAP_ID, entry);
    entry.set('order', 0);
    entry.set('w', this._geometry.mapWidth);
    entry.set('h', this._geometry.mapHeight);
  }

  /** Which sheet answers to a sprite number, or nothing where the number names no cell. */
  sheetOf(sprite: number): Sheet | undefined {
    return this.sheets.find((s) => s.holds(sprite));
  }

  mapOf(id: string): GameMap | undefined {
    return this.maps.find((m) => m.id === id);
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
   * Told when a sheet or a map is added, removed or renamed, since the Yjs collections signal
   * nothing to derived state.
   */
  onCollectionsChange(fn: () => void): () => void {
    this.collectionListeners.add(fn);
    return () => this.collectionListeners.delete(fn);
  }

  /**
   * Takes a size the document now states and tells the listeners; mirrors reshape on their next
   * read.
   */
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
    this.forgetProjections();
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
    const sheetWidth = size.sheetWidth ?? this._geometry.sheetWidth;
    const sheetHeight = size.sheetHeight ?? this._geometry.sheetHeight;
    const before = this.sheets;
    const after = this.shapesAfterResize(FIRST_SHEET_ID, sheetWidth, sheetHeight);
    const held = this.holdNumbered();
    this.doc.transact(() => {
      if (size.sheetWidth !== undefined || size.sheetHeight !== undefined)
        this.writeSheetSize(FIRST_SHEET_ID, sheetWidth, sheetHeight);
      if (size.mapWidth !== undefined || size.mapHeight !== undefined)
        this.writeMapSize(
          FIRST_MAP_ID,
          size.mapWidth ?? this._geometry.mapWidth,
          size.mapHeight ?? this._geometry.mapHeight,
        );
      this.renumber(before, after, held);
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
   * The names the game gives its actions, persisted so they show without running the game; empty
   * when it names none.
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

  /** An action with a blank label is an action left unnamed, so it is not written at all. */
  setDeclaredActions(actions: readonly DeclaredAction[]): void {
    const next = actions
      .map((a) => ({ action: a.action, label: a.label.trim() }))
      .filter((a) => a.label.length > 0);
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

  /** The first sheet's pixel at x,y, which is what `gfx.pixel` reads. */
  getPixel(x: number, y: number): number {
    return this.sheets[0]?.getPixel(x, y) ?? 0;
  }

  setPixel(x: number, y: number, colour: number): void {
    this.sheets[0]?.setPixel(x, y, colour);
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
   * Where a sprite number starts on the sheet that answers to it, or the first sheet's origin when
   * no sheet does.
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
    const first = this.sheets[0];
    if (!first || index < 0 || index >= first.count) return;
    first.setFlag(index, value);
  }

  onFlagsChange(l: () => void): Unsubscribe {
    this.flagListeners.add(l);
    return () => this.flagListeners.delete(l);
  }

  // ---- map ------------------------------------------------------------------

  /** The first map's tile, as `getPixel` is the first sheet's pixel: the one every game has. */
  getTile(x: number, y: number): number {
    return this.maps[0]?.getTile(x, y) ?? 0;
  }

  setTile(x: number, y: number, sprite: number): void {
    this.maps[0]?.setTile(x, y, sprite);
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
   * Ids first to last, anything not named kept after them, in one transaction so observers reload
   * once.
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

  /** Every file's source in tab order, which is evaluation order. */
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
    // Older saves lack detune and glide, which the synth reads every sample.
    for (const [, i] of out) {
      i.detune ??= 0;
      i.glide ??= 0;
      // A legacy empty `steps` list meant off, which only a zero rate says now.
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
   * Puts a saved snapshot back as ordinary edits of the differences, since applying an update of
   * this document's own past is a CRDT no-op.
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
        this.restoreCollection(this.sheetsMap, from.sheetsMap);
        this.restoreCollection(this.mapsMap, from.mapsMap);
        for (const key of RESTORED_TEXTS) {
          replaceText(this.doc.getText(key), scratch.getText(key).toString());
        }
      }, LOCAL_ORIGIN);
    } finally {
      scratch.destroy();
    }
  }

  /**
   * Sheets and maps hold nested cell maps, so entries are copied rather than set by value, and
   * those the snapshot lacks are removed; an entry both hold is edited in place, so the observers
   * already on its cells see each one that goes.
   */
  private restoreCollection(into: Y.Map<Y.Map<unknown>>, from: Y.Map<Y.Map<unknown>>): void {
    for (const id of [...into.keys()]) if (!from.has(id)) into.delete(id);
    from.forEach((entry, id) => {
      let target = into.get(id);
      if (!target) {
        target = new Y.Map<unknown>();
        into.set(id, target);
      }
      for (const key of [...target.keys()]) if (!entry.has(key)) target.delete(key);
      entry.forEach((value, key) => {
        if (!(value instanceof Y.Map)) {
          if (target.get(key) !== value) target.set(key, value);
          return;
        }
        let cells = target.get(key);
        if (!(cells instanceof Y.Map)) {
          cells = new Y.Map<number>();
          target.set(key, cells);
        }
        replaceMap(cells as Y.Map<unknown>, value as Y.Map<unknown>);
      });
    });
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
   * Repairs a document seeded twice, dropping only empty or identical entry files and renaming any
   * that diverged.
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
