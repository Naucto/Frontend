import * as Y from 'yjs';

import { type DeclaredAction, isAction } from '../input/ActionMap';
import type { Instrument, Pattern, Song } from '../sound/model';
import { BUBBLEGUM_16 } from './defaults';
import { GameMap, type MapWriter } from './GameMap';
import { clampMapSize, clampSheetSize, type Geometry, geometryOf } from './geometry';
import {
  ENTRY_KEYS,
  KEYS,
  MAIN_FILE,
  MAP_HEIGHT,
  MAP_WIDTH,
  META_KEYS,
  PALETTE_SIZE,
  SHEET_HEIGHT,
  SHEET_WIDTH,
  SPRITE_SIZE,
} from './keys';
import { Sheet, type SheetWriter } from './Sheet';

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
export type Unsubscribe = () => void;

export interface CodeFile {
  id: string;
  name: string;
  order: number;
  /** Palette slot this file is labelled with, or null when it takes none. */
  colour: number | null;
  text: Y.Text;
}

/** The part of the sound library an edit touched. */
export type SoundLibraryPart = 'instruments' | 'patterns' | 'sfx' | 'songs' | 'samples';

/** What a running game may ask of its permission rules; writing them is the editor's. */
export type NetPermissionRules = Pick<Y.Map<{ flags: number }>, 'forEach' | 'get' | 'has'>;

export const coordKey = (x: number, y: number): string => `${String(x)},${String(y)}`;
const parseCoord = (key: string): [number, number] => {
  const i = key.indexOf(',');
  return [Number(key.slice(0, i)), Number(key.slice(i + 1))];
};

type SheetCellsKey = typeof ENTRY_KEYS.pixels | typeof ENTRY_KEYS.flags;

/** Origin of a tool-local transaction so observers can tell local edits from remote ones. */
export const LOCAL_ORIGIN = 'local';

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

export function numberOf(entry: Y.Map<unknown>, key: string, fallback: number): number {
  const value = entry.get(key);

  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function colourOf(entry: Y.Map<unknown>): number | null {
  const value = entry.get(ENTRY_KEYS.colour);

  return typeof value === 'number' ? value : null;
}

function stringOf(entry: Y.Map<unknown>, key: string, fallback: string): string {
  const value = entry.get(key);

  return typeof value === 'string' ? value : fallback;
}

/**
 * Typed, observable read access to a game document (Yjs): what the runtime, the player and the
 * renderer use. Materialises the sprite sheets, flags and tile maps as typed arrays kept in sync
 * from Yjs events so the renderer and editors never walk a map's entries per frame. Writing
 * the document is {@link EditableGame}'s.
 */
export class Game {
  protected readonly doc: Y.Doc;
  protected readonly meta: Y.Map<unknown>;
  protected readonly codeFiles: Y.Map<Y.Map<unknown>>;
  protected readonly codeMeta: Y.Map<string>;
  protected readonly paletteArray: Y.Array<string>;
  /** The sheets and the maps a game has, each entry holding its own cells and size. */
  protected readonly sheetsMap: Y.Map<Y.Map<unknown>>;
  protected readonly mapsMap: Y.Map<Y.Map<unknown>>;
  protected readonly instruments: Y.Map<string>;
  protected readonly patterns: Y.Map<string>;
  protected readonly sfx: Y.Map<string>;
  protected readonly songs: Y.Map<string>;
  protected readonly samples: Y.Map<string>;
  readonly netPermissions: NetPermissionRules;

  protected currentGeometry: Geometry;
  private readonly geometryListeners = new Set<() => void>();
  private readonly collectionListeners = new Set<() => void>();
  protected readonly sheetMirrors = new Map<string, SheetMirror>();
  /** The projections as last built, or null once the document has moved under them. */
  private sheetsHeld: Sheet[] | null = null;
  private mapsHeld: GameMap[] | null = null;
  private readonly sheetWriter: SheetWriter = {
    setPixel: (id, x, y, colour) => {
      this.writeSheetPixel(id, x, y, colour);
    },
    setFlag: (id, local, value) => {
      this.writeSheetFlag(id, local, value);
    },
  };
  protected readonly mapMirrors = new Map<string, MapMirror>();
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
  private readonly soundListeners = new Set<(part: SoundLibraryPart) => void>();

  constructor(doc: Y.Doc) {
    this.doc = doc;
    this.meta = doc.getMap(KEYS.meta);
    this.codeFiles = doc.getMap(KEYS.codeFiles);
    this.codeMeta = doc.getMap(KEYS.codeMeta);
    this.paletteArray = doc.getArray(KEYS.palette);
    this.sheetsMap = doc.getMap(KEYS.sheets);
    this.mapsMap = doc.getMap(KEYS.maps);
    this.instruments = doc.getMap(KEYS.instruments);
    this.patterns = doc.getMap(KEYS.patterns);
    this.sfx = doc.getMap(KEYS.sfx);
    this.songs = doc.getMap(KEYS.songs);
    this.samples = doc.getMap(KEYS.samples);
    this.netPermissions = doc.getMap(KEYS.netPermissions);

    this.currentGeometry = this.readGeometry();

    this.attachSheetObservers();
    this.attachMapObservers();
    // Sheets a peer adds arrive after this constructor, and their cells need watching too.
    const told = (): void => {
      this.collectionListeners.forEach((listener) => {
        listener();
      });
    };
    // A size is the shape of every mirror, so a peer's resize is applied as it arrives. A cell
    // written inside an entry reaches these too, and is the cell observers' alone.
    const aboveCells = (events: Y.YEvent<Y.AbstractType<unknown>>[]): boolean =>
      events.some((event) => event.path.length < 2);
    const onSheets = (events: Y.YEvent<Y.AbstractType<unknown>>[]): void => {
      if (!aboveCells(events)) {
        return;
      }
      this.forgetProjections();
      this.attachSheetObservers();
      this.applyGeometry();
      told();
    };
    const onMaps = (events: Y.YEvent<Y.AbstractType<unknown>>[]): void => {
      if (!aboveCells(events)) {
        return;
      }
      this.forgetProjections();
      this.attachMapObservers();
      this.applyGeometry();
      told();
    };
    const onPalette = (): void => {
      this.paletteListeners.forEach((listener) => {
        listener();
      });
    };
    this.sheetsMap.observeDeep(onSheets);
    this.mapsMap.observeDeep(onMaps);
    this.paletteArray.observe(onPalette);
    this.unobservers.push(
      () => {
        this.sheetsMap.unobserveDeep(onSheets);
      },
      () => {
        this.mapsMap.unobserveDeep(onMaps);
      },
      () => {
        this.paletteArray.unobserve(onPalette);
      },
    );
    const library: [SoundLibraryPart, Y.Map<string>][] = [
      ['instruments', this.instruments],
      ['patterns', this.patterns],
      ['sfx', this.sfx],
      ['songs', this.songs],
      ['samples', this.samples],
    ];
    for (const [part, map] of library) {
      const onSound = (): void => {
        this.soundListeners.forEach((listener) => {
          listener(part);
        });
      };
      map.observe(onSound);
      this.unobservers.push(() => {
        map.unobserve(onSound);
      });
    }
  }

  /** Detaches this view from the document, which outlives it; the view is not to be used after. */
  destroy(): void {
    for (const off of this.unobservers.splice(0)) {
      off();
    }
  }

  // ---- sheets and maps ------------------------------------------------------

  /** Entries of a collection, sorted the way code files are: by order, then by name. */
  private orderedEntries(from: Y.Map<Y.Map<unknown>>): [string, Y.Map<unknown>][] {
    const out: [string, Y.Map<unknown>][] = [];
    from.forEach((entry, id) => {
      out.push([id, entry]);
    });

    return out.sort(
      (a, b) =>
        numberOf(a[1], ENTRY_KEYS.order, 0) - numberOf(b[1], ENTRY_KEYS.order, 0) ||
        a[0].localeCompare(b[0]),
    );
  }

  /**
   * The live pixel and flag mirrors of one sheet, made on first ask and rebuilt on resize, dropping
   * cells outside the shape.
   */
  private sheetMirror(id: string, size: { width: number; height: number }): SheetMirror {
    const { width, height } = size;
    const held = this.sheetMirrors.get(id);
    if (held?.width === width && held.height === height) {
      return held;
    }

    const count = (width / SPRITE_SIZE) * (height / SPRITE_SIZE);
    const made: SheetMirror = {
      pixels: new Uint8Array(width * height),
      flags: new Uint8Array(count),
      width,
      height,
    };
    this.cellsOf(id, ENTRY_KEYS.pixels)?.forEach((value, key) => {
      const [x, y] = parseCoord(key);
      if (x >= 0 && x < width && y >= 0 && y < height) {
        made.pixels[y * width + x] = value & 0xf;
      }
    });
    this.cellsOf(id, ENTRY_KEYS.flags)?.forEach((value, key) => {
      const i = Number(key);
      if (i >= 0 && i < count) {
        made.flags[i] = value & 0xff;
      }
    });
    this.sheetMirrors.set(id, made);

    return made;
  }

  private mapMirror(id: string, size: { width: number; height: number }): MapMirror {
    const { width, height } = size;
    const held = this.mapMirrors.get(id);
    if (held?.width === width && held.height === height) {
      return held;
    }

    const made: MapMirror = { tiles: new Uint16Array(width * height), width, height };
    this.mapCellsOf(id)?.forEach((value, key) => {
      const [x, y] = parseCoord(key);
      if (x >= 0 && x < width && y >= 0 && y < height) {
        made.tiles[y * width + x] = value & 0xffff;
      }
    });
    this.mapMirrors.set(id, made);

    return made;
  }

  /** Drops the held projections, so the next read builds them from the document. */
  protected forgetProjections(): void {
    this.sheetsHeld = null;
    this.mapsHeld = null;
  }

  /** Where a sheet's cells are, or null where it has none yet. */
  private cellsOf(sheetId: string, key: SheetCellsKey): Y.Map<number> | null {
    const held = this.sheetsMap.get(sheetId)?.get(key);

    return held instanceof Y.Map ? (held as Y.Map<number>) : null;
  }

  /** Where a map's tiles are, or null where it has none yet. */
  private mapCellsOf(mapId: string): Y.Map<number> | null {
    const held = this.mapsMap.get(mapId)?.get(ENTRY_KEYS.tiles);

    return held instanceof Y.Map ? (held as Y.Map<number>) : null;
  }

  /** A sheet's size, as its entry states it. */
  private sizeOf(sheetId: string): { width: number; height: number } {
    const entry = this.sheetsMap.get(sheetId);

    return {
      width: clampSheetSize(entry ? numberOf(entry, ENTRY_KEYS.width, SHEET_WIDTH) : SHEET_WIDTH),
      height: clampSheetSize(
        entry ? numberOf(entry, ENTRY_KEYS.height, SHEET_HEIGHT) : SHEET_HEIGHT,
      ),
    };
  }

  /** The same, for a map. */
  private mapSizeOf(mapId: string): { width: number; height: number } {
    const entry = this.mapsMap.get(mapId);

    return {
      width: clampMapSize(entry ? numberOf(entry, ENTRY_KEYS.width, MAP_WIDTH) : MAP_WIDTH),
      height: clampMapSize(entry ? numberOf(entry, ENTRY_KEYS.height, MAP_HEIGHT) : MAP_HEIGHT),
    };
  }

  /**
   * Every sheet, in order, with its sprite numbers worked out; held between document changes, so
   * inside a local transaction it answers as of before the write.
   */
  get sheets(): Sheet[] {
    if (this.sheetsHeld) {
      return this.sheetsHeld;
    }
    let base = 0;

    return (this.sheetsHeld = this.orderedEntries(this.sheetsMap).map(([id, entry], i) => {
      const { width, height } = this.sizeOf(id);
      const mirror = this.sheetMirror(id, { width, height });
      const sheet = new Sheet(
        id,
        stringOf(entry, ENTRY_KEYS.name, ''),
        numberOf(entry, ENTRY_KEYS.order, i),
        width,
        height,
        base,
        colourOf(entry),
        mirror.pixels,
        mirror.flags,
        this.sheetWriter,
      );
      base += sheet.count;

      return sheet;
    }));
  }

  get maps(): GameMap[] {
    if (this.mapsHeld) {
      return this.mapsHeld;
    }

    return (this.mapsHeld = this.orderedEntries(this.mapsMap).map(([id, entry], i) => {
      const { width, height } = this.mapSizeOf(id);

      return new GameMap(
        id,
        stringOf(entry, ENTRY_KEYS.name, ''),
        numberOf(entry, ENTRY_KEYS.order, i),
        width,
        height,
        colourOf(entry),
        this.mapMirror(id, { width, height }).tiles,
        this.mapWriter,
      );
    }));
  }

  /** A sheet's cells, made on first write so an undrawn sheet costs the document nothing. */
  protected sheetCells(sheetId: string, key: SheetCellsKey): Y.Map<number> {
    const held = this.cellsOf(sheetId, key);
    if (held) {
      return held;
    }
    const entry = this.sheetsMap.get(sheetId);
    if (!entry) {
      throw new Error(`no sheet ${sheetId}`);
    }
    const made = new Y.Map<number>();
    entry.set(key, made);

    return made;
  }
  /**
   * A map's cells, made on first write and left unobserved, since Yjs fires no event for a type
   * made and written in one transaction.
   */
  protected mapCells(mapId: string): Y.Map<number> {
    const held = this.mapCellsOf(mapId);
    if (held) {
      return held;
    }
    const entry = this.mapsMap.get(mapId);
    if (!entry) {
      throw new Error(`no map ${mapId}`);
    }
    const made = new Y.Map<number>();
    entry.set(ENTRY_KEYS.tiles, made);

    return made;
  }

  /** Brings a sheet's mirror in step with these cells and tells the listeners what moved. */
  private tellCells(
    sheetId: string,
    key: SheetCellsKey,
    cells: Y.Map<number>,
    keys: Iterable<string>,
  ): void {
    const sheet = this.sheets.find((candidate) => candidate.id === sheetId);
    if (!sheet) {
      return;
    }
    const changes: PixelChange[] = [];
    for (const cellKey of keys) {
      if (key === ENTRY_KEYS.flags) {
        const i = Number(cellKey);
        if (i >= 0 && i < sheet.count) {
          sheet.flags[i] = (cells.get(cellKey) ?? 0) & 0xff;
        }
        continue;
      }
      const [x, y] = parseCoord(cellKey);
      if (x < 0 || x >= sheet.width || y < 0 || y >= sheet.height) {
        continue;
      }
      const colour = (cells.get(cellKey) ?? 0) & 0xf;
      sheet.pixels[y * sheet.width + x] = colour;
      changes.push({ sheet: sheetId, x, y, colour });
    }
    if (key === ENTRY_KEYS.flags) {
      this.flagListeners.forEach((listener) => {
        listener();
      });
    } else if (changes.length) {
      this.pixelListeners.forEach((listener) => {
        listener(changes);
      });
    }
  }

  private observeSheetCells(sheetId: string, key: SheetCellsKey, cells: Y.Map<number>): void {
    const onCells = (event: Y.YMapEvent<number>): void => {
      this.tellCells(sheetId, key, cells, event.changes.keys.keys());
    };
    cells.observe(onCells);
    this.unobservers.push(() => {
      cells.unobserve(onCells);
    });
  }

  /** Watches the cell maps of every sheet that has any, once each. */
  private attachSheetObservers(): void {
    for (const id of this.sheetsMap.keys()) {
      for (const key of [ENTRY_KEYS.pixels, ENTRY_KEYS.flags]) {
        const cells = this.cellsOf(id, key);
        if (!cells || this.watchedCells.has(cells)) {
          continue;
        }
        this.watchedCells.add(cells);
        this.observeSheetCells(id, key, cells);
        this.tellCells(id, key, cells, cells.keys());
      }
    }
  }

  /** Brings the mirror in step with these cells and tells the listeners which tiles moved. */
  private tellTiles(mapId: string, cells: Y.Map<number>, keys: Iterable<string>): void {
    const map = this.maps.find((candidate) => candidate.id === mapId);
    if (!map) {
      return;
    }
    const changes: TileChange[] = [];
    for (const cellKey of keys) {
      const [x, y] = parseCoord(cellKey);
      if (x < 0 || x >= map.width || y < 0 || y >= map.height) {
        continue;
      }
      const sprite = (cells.get(cellKey) ?? 0) & 0xffff;
      map.tiles[y * map.width + x] = sprite;
      changes.push({ map: mapId, x, y, sprite });
    }
    if (changes.length) {
      this.tileListeners.forEach((listener) => {
        listener(changes);
      });
    }
  }

  /** The tile twin of `observeSheetCells`. */
  private observeMapCells(mapId: string, cells: Y.Map<number>): void {
    const onCells = (event: Y.YMapEvent<number>): void => {
      this.tellTiles(mapId, cells, event.changes.keys.keys());
    };
    cells.observe(onCells);
    this.unobservers.push(() => {
      cells.unobserve(onCells);
    });
  }

  /** The same for the maps. */
  private attachMapObservers(): void {
    for (const id of this.mapsMap.keys()) {
      const cells = this.mapCellsOf(id);
      if (!cells || this.watchedCells.has(cells)) {
        continue;
      }
      this.watchedCells.add(cells);
      this.observeMapCells(id, cells);
      // A cell map made and written in one transaction fired no event, so its tiles are told now.
      this.tellTiles(id, cells, cells.keys());
    }
  }

  private writeSheetPixel(sheetId: string, x: number, y: number, colour: number): void {
    const cells = this.sheetCells(sheetId, ENTRY_KEYS.pixels);
    const key = coordKey(x, y);
    if (colour === 0) {
      if (cells.has(key)) {
        cells.delete(key);
      }
    } else {
      cells.set(key, colour & 0xf);
    }
  }

  private writeSheetFlag(sheetId: string, local: number, value: number): void {
    const cells = this.sheetCells(sheetId, ENTRY_KEYS.flags);
    const key = String(local);
    const masked = value & 0xff;
    if (masked === 0) {
      if (cells.has(key)) {
        cells.delete(key);
      }
    } else {
      cells.set(key, masked);
    }
  }
  private writeMapTile(mapId: string, x: number, y: number, sprite: number): void {
    const cells = this.mapCells(mapId);
    const key = coordKey(x, y);
    if (sprite === 0) {
      if (cells.has(key)) {
        cells.delete(key);
      }
    } else {
      cells.set(key, sprite & 0xffff);
    }
  }

  /** Which sheet answers to a sprite number, or nothing where the number names no cell. */
  sheetOf(sprite: number): Sheet | undefined {
    return this.sheets.find((sheet) => sheet.holds(sprite));
  }

  // ---- geometry -------------------------------------------------------------

  /** How big this game's first sheet and first map are. Read it per use; a resize replaces it. */
  get geometry(): Geometry {
    return this.currentGeometry;
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

  /** The first sheet's and first map's sizes, at the defaults for a game without one. */
  private readGeometry(): Geometry {
    const [sheetId] = this.orderedEntries(this.sheetsMap)[0] ?? [];
    const [mapId] = this.orderedEntries(this.mapsMap)[0] ?? [];
    const sheet = sheetId === undefined ? null : this.sizeOf(sheetId);
    const map = mapId === undefined ? null : this.mapSizeOf(mapId);

    return geometryOf(
      sheet?.width ?? SHEET_WIDTH,
      sheet?.height ?? SHEET_HEIGHT,
      map?.width ?? MAP_WIDTH,
      map?.height ?? MAP_HEIGHT,
    );
  }

  /**
   * Takes the size the document now states and tells the listeners; mirrors reshape on their next
   * read.
   */
  private applyGeometry(): void {
    const next = this.readGeometry();
    if (
      next.sheetWidth === this.currentGeometry.sheetWidth &&
      next.sheetHeight === this.currentGeometry.sheetHeight &&
      next.mapWidth === this.currentGeometry.mapWidth &&
      next.mapHeight === this.currentGeometry.mapHeight
    ) {
      return;
    }

    this.currentGeometry = next;
    this.forgetProjections();
    this.geometryListeners.forEach((listener) => {
      listener();
    });
  }

  // ---- meta -----------------------------------------------------------------

  get schemaVersion(): number {
    const value = this.meta.get(META_KEYS.schemaVersion);
    return typeof value === 'number' ? value : 0;
  }

  /**
   * The names the game gives its actions, persisted so they show without running the game; empty
   * when it names none.
   */
  get declaredActions(): readonly DeclaredAction[] {
    const raw = this.meta.get(META_KEYS.actions);
    if (!Array.isArray(raw)) {
      return [];
    }
    return raw.filter(
      (entry): entry is DeclaredAction =>
        typeof entry === 'object' &&
        entry !== null &&
        isAction((entry as DeclaredAction).action) &&
        typeof (entry as DeclaredAction).label === 'string',
    );
  }

  // ---- palette --------------------------------------------------------------

  get palette(): string[] {
    const colours = this.paletteArray.toArray();
    if (colours.length === PALETTE_SIZE) {
      return colours;
    }
    return [...BUBBLEGUM_16];
  }

  onPaletteChange(listener: () => void): Unsubscribe {
    this.paletteListeners.add(listener);
    return () => this.paletteListeners.delete(listener);
  }

  // ---- sprites --------------------------------------------------------------

  onPixelsChange(listener: (changes: PixelChange[]) => void): Unsubscribe {
    this.pixelListeners.add(listener);
    return () => this.pixelListeners.delete(listener);
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

  /** A sprite's flags, read on whichever sheet answers to its number; zero where none does. */
  flagOf(sprite: number): number {
    return this.sheetOf(sprite)?.getFlag(sprite) ?? 0;
  }

  flagBitOf(sprite: number, bit: number): boolean {
    return ((this.flagOf(sprite) >> bit) & 1) === 1;
  }

  onFlagsChange(listener: () => void): Unsubscribe {
    this.flagListeners.add(listener);
    return () => this.flagListeners.delete(listener);
  }

  // ---- map ------------------------------------------------------------------

  onTilesChange(listener: (changes: TileChange[]) => void): Unsubscribe {
    this.tileListeners.add(listener);
    return () => this.tileListeners.delete(listener);
  }

  // ---- code -----------------------------------------------------------------

  get files(): CodeFile[] {
    const out: CodeFile[] = [];
    this.codeFiles.forEach((entry, id) => {
      const text = entry.get(ENTRY_KEYS.text);
      if (!(text instanceof Y.Text)) {
        return;
      }
      out.push({
        id,
        name:
          typeof entry.get(ENTRY_KEYS.name) === 'string'
            ? (entry.get(ENTRY_KEYS.name) as string)
            : id,
        order: Number(entry.get(ENTRY_KEYS.order) ?? 0),
        colour:
          typeof entry.get(ENTRY_KEYS.colour) === 'number'
            ? (entry.get(ENTRY_KEYS.colour) as number)
            : null,
        text,
      });
    });
    return out.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  }

  get entryFile(): CodeFile | undefined {
    const files = this.files;
    const entryId = this.codeMeta.get(META_KEYS.entry);
    return (
      files.find((file) => file.id === entryId) ??
      files.find((file) => file.name === MAIN_FILE) ??
      files[0]
    );
  }

  /** Every file's source in tab order, which is evaluation order. */
  sources(): { name: string; source: string }[] {
    return this.files.map((file) => ({ name: file.name, source: file.text.toString() }));
  }

  // ---- sound ----------------------------------------------------------------

  private parseMap<T>(map: Y.Map<string>): Map<string, T> {
    const out = new Map<string, T>();
    map.forEach((raw, key) => {
      try {
        out.set(key, JSON.parse(raw) as T);
      } catch {
        /* ignore corrupt entry */
      }
    });
    return out;
  }

  getInstruments(): Map<string, Instrument> {
    return this.parseMap<Instrument>(this.instruments);
  }
  getPatterns(): Map<string, Pattern> {
    return this.parseMap<Pattern>(this.patterns);
  }
  getSongs(): Map<string, Song> {
    return this.parseMap<Song>(this.songs);
  }
  /** sfx slot number → pattern id */
  getSfxSlots(): Map<string, string> {
    const out = new Map<string, string>();
    this.sfx.forEach((patternId, key) => out.set(key, patternId));
    return out;
  }
  /** Sample id → its encoded PCM, as stored. */
  getSamples(): Map<string, string> {
    return new Map(this.samples.entries());
  }

  /** Told which part of the sound library changed, whoever changed it. */
  onSoundLibraryChange(listener: (part: SoundLibraryPart) => void): Unsubscribe {
    this.soundListeners.add(listener);
    return () => this.soundListeners.delete(listener);
  }
}
