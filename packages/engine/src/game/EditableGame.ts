import * as Y from 'yjs';

import type { DeclaredAction } from '../input/ActionMap';
import type { Instrument, Pattern, Song } from '../sound/model';
import {
  BUBBLEGUM_16,
  DEFAULT_GAME_CODE,
  DEFAULT_PLAYER_SPRITE,
  DEFAULT_PLAYER_SPRITE_INDICES,
  DEFAULT_SPRITE_COLOUR,
} from './defaults';
import { type CodeFile, coordKey, Game, LOCAL_ORIGIN } from './Game';
import { clampMapSize, clampSheetSize } from './geometry';
import {
  ENTRY_KEYS,
  FIRST_MAP_ID,
  FIRST_SHEET_ID,
  GAME_SCHEMA_VERSION,
  KEYS,
  MAIN_FILE,
  MAIN_FILE_ID,
  MAP_HEIGHT,
  MAP_WIDTH,
  META_KEYS,
  PALETTE_SIZE,
  SHEET_HEIGHT,
  SHEET_WIDTH,
  SPRITE_SIZE,
} from './keys';
import { remapSprites, rewriteSpriteNumbers, survives } from './renumber';
import type { SheetShape } from './Sheet';

/** A number that names no cell any more. Not a sprite anybody can draw, so nothing keeps it. */
const NOT_A_SPRITE = -1;

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

/**
 * How {@link EditableGame.restoreFrom} puts each root back: a flat map or array by value, a text by
 * its differing span, the code files and the sheet and map collections entry by entry since they
 * nest.
 */
type RestoreKind = 'map' | 'array' | 'text' | 'files' | 'collection';

/**
 * Every root of the document and how it is restored, walked in this order. Keyed by {@link KEYS},
 * so a root added there does not compile until it is given a kind here.
 */
export const RESTORE_KINDS: Readonly<Record<keyof typeof KEYS, RestoreKind>> = {
  meta: 'map',
  codeMeta: 'map',
  instruments: 'map',
  patterns: 'map',
  sfx: 'map',
  songs: 'map',
  samples: 'map',
  netPermissions: 'map',
  palette: 'array',
  codeFiles: 'files',
  sheets: 'collection',
  maps: 'collection',
  // Texts the editor writes directly, outside anything Game models.
  projectName: 'text',
  shortDescription: 'text',
  longDescription: 'text',
  iconUrl: 'text',
  projectTags: 'text',
};

/** Makes `target` hold exactly what `source` holds, touching only the keys that differ. */
function replaceMap<T>(target: Y.Map<T>, source: Y.Map<T>): void {
  for (const key of [...target.keys()]) {
    if (!source.has(key)) {
      target.delete(key);
    }
  }
  source.forEach((value, key) => {
    if (target.get(key) !== value) {
      target.set(key, value);
    }
  });
}

function replaceArray<T>(target: Y.Array<T>, source: Y.Array<T>): void {
  const wanted = source.toArray();
  if (
    target.length === wanted.length &&
    target.toArray().every((value, i) => value === wanted[i])
  ) {
    return;
  }
  target.delete(0, target.length);
  target.insert(0, wanted);
}

/**
 * Rewrites the smallest span that differs, so restoring a file nobody edited is free and restoring
 * one that was edited at the end does not re-type the whole thing.
 */
function replaceText(target: Y.Text, wanted: string): void {
  const current = target.toString();
  if (current === wanted) {
    return;
  }
  let head = 0;
  const max = Math.min(current.length, wanted.length);
  while (head < max && current[head] === wanted[head]) {
    head++;
  }
  let tail = 0;
  while (
    tail < max - head &&
    current[current.length - 1 - tail] === wanted[wanted.length - 1 - tail]
  ) {
    tail++;
  }
  const removed = current.length - head - tail;
  if (removed > 0) {
    target.delete(head, removed);
  }
  const added = wanted.slice(head, wanted.length - tail);
  if (added) {
    target.insert(head, added);
  }
}

/**
 * A game being edited: every write to the document, and the raw Yjs roots the editor binds to
 * (undo scopes, version signals).
 */
export class EditableGame extends Game {
  declare readonly doc: Y.Doc;
  declare readonly meta: Y.Map<unknown>;
  declare readonly codeFiles: Y.Map<Y.Map<unknown>>;
  declare readonly paletteArray: Y.Array<string>;
  declare readonly sheetsMap: Y.Map<Y.Map<unknown>>;
  declare readonly mapsMap: Y.Map<Y.Map<unknown>>;
  declare readonly instruments: Y.Map<string>;
  declare readonly patterns: Y.Map<string>;
  declare readonly sfx: Y.Map<string>;
  declare readonly songs: Y.Map<string>;
  declare readonly samples: Y.Map<string>;
  declare readonly netPermissions: Y.Map<{ flags: number }>;

  /** Batch writes into one transaction (one undo step, one network update). */
  transact(fn: () => void, origin: unknown = LOCAL_ORIGIN): void {
    this.doc.transact(fn, origin);
  }

  // ---- sheets and maps ------------------------------------------------------

  /** Adds a sheet after the ones there are, and gives it the numbers that follow theirs. */
  addSheet(name: string, width: number, height: number, id: string = crypto.randomUUID()): void {
    this.doc.transact(() => {
      const order = this.sheets.reduce((max, sh) => Math.max(max, sh.order), -1) + 1;
      const entry = new Y.Map<unknown>();
      this.sheetsMap.set(id, entry);
      entry.set(ENTRY_KEYS.name, name);
      entry.set(ENTRY_KEYS.order, order);
      entry.set(ENTRY_KEYS.width, clampSheetSize(width));
      entry.set(ENTRY_KEYS.height, clampSheetSize(height));
    }, LOCAL_ORIGIN);
  }

  /** The sheets as they would be, in order, if this one took that size. */
  private shapesAfterResize(id: string, width: number, height: number): SheetShape[] {
    let base = 0;

    return this.sheets.map((sh) => {
      const nextWidth = sh.id === id ? clampSheetSize(width) : sh.width;
      const nextHeight = sh.id === id ? clampSheetSize(height) : sh.height;
      const at = base;
      base += (nextWidth / SPRITE_SIZE) * (nextHeight / SPRITE_SIZE);

      return {
        id: sh.id,
        name: sh.name,
        order: sh.order,
        colour: sh.colour,
        width: nextWidth,
        height: nextHeight,
        base: at,
      };
    });
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
    for (const map of this.maps) {
      for (const sprite of map.tiles) {
        if (sprite !== 0 && (moves.has(sprite) || !survives(sprite, before, after))) {
          tiles++;
        }
      }
    }
    let calls = 0;
    let unsure = 0;
    for (const file of this.files) {
      const out = rewriteSpriteNumbers(file.text.toString(), moves);
      calls += out.changed;
      unsure += out.unsure;
    }
    let lost = 0;
    for (const sh of before) {
      for (let spriteNumber = sh.base; spriteNumber < sh.base + sh.count; spriteNumber++) {
        if (!survives(spriteNumber, before, after) && !sh.isEmpty(spriteNumber)) {
          lost++;
        }
      }
    }

    return { moves: moves.size, tiles, calls, unsure, lost };
  }

  /** Everything that names a sprite by number, copied out before the sizes move. */
  private holdNumbered(): HeldNumbers {
    return {
      flags: this.sheets.map((sh) => ({ id: sh.id, base: sh.base, values: Array.from(sh.flags) })),
      tiles: this.maps.map((map) => ({
        id: map.id,
        width: map.width,
        values: Array.from(map.tiles),
      })),
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
    if (moves.size === 0) {
      return;
    }
    const kept = (spriteNumber: number): number =>
      moves.get(spriteNumber) ??
      (survives(spriteNumber, before, after) ? spriteNumber : NOT_A_SPRITE);

    for (const sh of held.flags) {
      const now = after.find((shape) => shape.id === sh.id);
      if (!now) {
        continue;
      }
      const cells = (now.width / SPRITE_SIZE) * (now.height / SPRITE_SIZE);
      const next = new Map<number, number>();
      sh.values.forEach((value, local) => {
        if (value === 0) {
          return;
        }
        const to = kept(sh.base + local);
        if (to !== NOT_A_SPRITE) {
          next.set(to - now.base, value);
        }
      });
      const target = this.sheetCells(now.id, ENTRY_KEYS.flags);
      target.forEach((_v, key) => {
        target.delete(key);
      });
      for (let i = 0; i < cells; i++) {
        const value = next.get(i);
        if (value) {
          target.set(String(i), value);
        }
      }
    }

    for (const heldMap of held.tiles) {
      if (!heldMap.values.some((sprite) => sprite !== 0)) {
        continue;
      }
      const tiles = this.mapCells(heldMap.id);
      heldMap.values.forEach((sprite, at) => {
        if (sprite === 0) {
          return;
        }
        const to = kept(sprite);
        const key = coordKey(at % heldMap.width, Math.floor(at / heldMap.width));
        if (to === NOT_A_SPRITE || to === 0) {
          tiles.delete(key);
        } else {
          tiles.set(key, to & 0xffff);
        }
      });
    }

    for (const file of this.files) {
      const out = rewriteSpriteNumbers(file.text.toString(), moves);
      if (out.changed === 0) {
        continue;
      }
      file.text.delete(0, file.text.length);
      file.text.insert(0, out.text);
    }
  }

  /**
   * Resizes a sheet and renumbers what named its sprites, in one transaction so no peer reads a
   * half-renumbered document.
   */
  resizeSheet(id: string, width: number, height: number): void {
    const before = this.sheets;
    if (!before.some((sh) => sh.id === id)) {
      return;
    }
    const after = this.shapesAfterResize(id, width, height);
    const held = this.holdNumbered();
    const entry = this.sheetsMap.get(id);
    this.doc.transact(() => {
      entry?.set(ENTRY_KEYS.width, clampSheetSize(width));
      entry?.set(ENTRY_KEYS.height, clampSheetSize(height));
      this.renumber(before, after, held);
    }, LOCAL_ORIGIN);
  }
  /** Resizes one map; tiles keep their place, so nothing is renumbered. */
  resizeMap(id: string, width: number, height: number): void {
    const entry = this.mapsMap.get(id);
    if (!entry) {
      return;
    }
    this.doc.transact(() => {
      entry.set(ENTRY_KEYS.width, clampMapSize(width));
      entry.set(ENTRY_KEYS.height, clampMapSize(height));
    }, LOCAL_ORIGIN);
  }

  private describe(
    from: Y.Map<Y.Map<unknown>>,
    id: string,
    name: string,
    colour: number | null,
  ): void {
    const entry = from.get(id);
    if (!entry) {
      return;
    }
    this.doc.transact(() => {
      entry.set(ENTRY_KEYS.name, name);
      if (colour === null) {
        entry.delete(ENTRY_KEYS.colour);
      } else {
        entry.set(ENTRY_KEYS.colour, colour);
      }
    }, LOCAL_ORIGIN);
  }

  /** A colour of null takes none, rather than taking slot zero. */
  describeSheet(id: string, name: string, colour: number | null): void {
    this.describe(this.sheetsMap, id, name, colour);
  }

  describeMap(id: string, name: string, colour: number | null): void {
    this.describe(this.mapsMap, id, name, colour);
  }

  /**
   * Refuses the only sheet, and renumbers what named the sheets after the removed one, since their
   * numbers shift down onto its own.
   */
  removeSheet(id: string): void {
    if (this.sheetsMap.size <= 1 || !this.sheetsMap.has(id)) {
      return;
    }
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
      const order = this.maps.reduce((max, mp) => Math.max(max, mp.order), -1) + 1;
      const entry = new Y.Map<unknown>();
      this.mapsMap.set(id, entry);
      entry.set(ENTRY_KEYS.name, name);
      entry.set(ENTRY_KEYS.order, order);
      entry.set(ENTRY_KEYS.width, clampMapSize(width));
      entry.set(ENTRY_KEYS.height, clampMapSize(height));
    }, LOCAL_ORIGIN);
  }

  removeMap(id: string): void {
    if (this.mapsMap.size <= 1) {
      return;
    }
    this.doc.transact(() => {
      this.mapsMap.delete(id);
      this.mapMirrors.delete(id);
    }, LOCAL_ORIGIN);
  }

  // ---- meta -----------------------------------------------------------------

  /** An action with a blank label is an action left unnamed, so it is not written at all. */
  setDeclaredActions(actions: readonly DeclaredAction[]): void {
    const next = actions
      .map((declared) => ({ action: declared.action, label: declared.label.trim() }))
      .filter((declared) => declared.label.length > 0);
    if (JSON.stringify(next) === JSON.stringify(this.declaredActions)) {
      return;
    }
    this.doc.transact(() => {
      this.meta.set(META_KEYS.actions, next);
    }, LOCAL_ORIGIN);
  }

  // ---- palette --------------------------------------------------------------

  setPaletteColour(index: number, hex: string): void {
    if (index < 0 || index >= PALETTE_SIZE) {
      return;
    }
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
        colours.slice(0, PALETTE_SIZE).map((colour) => colour.toLowerCase()),
      );
    }, LOCAL_ORIGIN);
  }

  // ---- code -----------------------------------------------------------------

  /**
   * `id` is only passed when the key has to be reproducible across clients — the entry file, so a
   * concurrent seed converges instead of merging into two entries. Everything else gets a UUID.
   */
  addFile(name: string, source = '', id: string = crypto.randomUUID()): CodeFile {
    const order = this.files.reduce((max, file) => Math.max(max, file.order), -1) + 1;
    this.doc.transact(() => {
      const entry = new Y.Map<unknown>();
      const text = new Y.Text();
      this.codeFiles.set(id, entry);
      entry.set(ENTRY_KEYS.name, name);
      entry.set(ENTRY_KEYS.order, order);
      entry.set(ENTRY_KEYS.text, text);
      if (source) {
        text.insert(0, source);
      }
      if (!this.codeMeta.has(META_KEYS.entry) && name === MAIN_FILE) {
        this.codeMeta.set(META_KEYS.entry, id);
      }
    }, LOCAL_ORIGIN);
    return {
      id,
      name,
      order,
      colour: null,
      text: this.codeFiles.get(id)?.get(ENTRY_KEYS.text) as Y.Text,
    };
  }

  renameFile(id: string, name: string): void {
    this.codeFiles.get(id)?.set(ENTRY_KEYS.name, name);
  }

  /**
   * Ids first to last, anything not named kept after them, in one transaction so observers reload
   * once.
   */
  reorderFiles(ids: readonly string[]): void {
    const ranked = new Map(ids.map((id, i) => [id, i]));
    const rest = this.files.filter((file) => !ranked.has(file.id));
    this.doc.transact(() => {
      ids.forEach((id, i) => this.codeFiles.get(id)?.set(ENTRY_KEYS.order, i));
      rest.forEach((file, i) => this.codeFiles.get(file.id)?.set(ENTRY_KEYS.order, ids.length + i));
    }, LOCAL_ORIGIN);
  }

  setFileColour(id: string, colour: number | null): void {
    const entry = this.codeFiles.get(id);
    if (!entry) {
      return;
    }
    if (colour === null) {
      entry.delete(ENTRY_KEYS.colour);
    } else {
      entry.set(ENTRY_KEYS.colour, colour);
    }
  }

  removeFile(id: string): void {
    if (this.files.length <= 1) {
      return;
    }
    this.doc.transact(() => {
      this.codeFiles.delete(id);
      if (this.codeMeta.get(META_KEYS.entry) === id) {
        this.codeMeta.delete(META_KEYS.entry);
      }
    }, LOCAL_ORIGIN);
  }

  // ---- sound ----------------------------------------------------------------

  setInstrument(instrument: Instrument): void {
    this.instruments.set(instrument.id, JSON.stringify(instrument));
  }
  setPattern(pattern: Pattern): void {
    this.patterns.set(pattern.id, JSON.stringify(pattern));
  }
  setSong(slot: number, song: Song): void {
    this.songs.set(String(slot), JSON.stringify(song));
  }

  // ---- versions -------------------------------------------------------------

  /**
   * Sheets and maps hold nested cell maps, so entries are copied rather than set by value, and
   * those the snapshot lacks are removed; an entry both hold is edited in place, so the observers
   * already on its cells see each one that goes.
   */
  private restoreCollection(into: Y.Map<Y.Map<unknown>>, from: Y.Map<Y.Map<unknown>>): void {
    for (const id of [...into.keys()]) {
      if (!from.has(id)) {
        into.delete(id);
      }
    }
    from.forEach((entry, id) => {
      let target = into.get(id);
      if (!target) {
        target = new Y.Map<unknown>();
        into.set(id, target);
      }
      for (const key of [...target.keys()]) {
        if (!entry.has(key)) {
          target.delete(key);
        }
      }
      entry.forEach((value, key) => {
        if (!(value instanceof Y.Map)) {
          if (target.get(key) !== value) {
            target.set(key, value);
          }
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
  private restoreFiles(from: Y.Map<Y.Map<unknown>>): void {
    for (const id of [...this.codeFiles.keys()]) {
      if (!from.has(id)) {
        this.codeFiles.delete(id);
      }
    }
    from.forEach((source, id) => {
      let target = this.codeFiles.get(id);
      if (!target) {
        target = new Y.Map<unknown>();
        this.codeFiles.set(id, target);
        target.set(ENTRY_KEYS.text, new Y.Text());
      }
      const name = source.get(ENTRY_KEYS.name);
      const order = source.get(ENTRY_KEYS.order);
      if (target.get(ENTRY_KEYS.name) !== name) {
        target.set(ENTRY_KEYS.name, name);
      }
      if (target.get(ENTRY_KEYS.order) !== order) {
        target.set(ENTRY_KEYS.order, order);
      }
      const text = target.get(ENTRY_KEYS.text);
      const wanted = source.get(ENTRY_KEYS.text);
      if (text instanceof Y.Text && wanted instanceof Y.Text) {
        replaceText(text, wanted.toString());
      }
    });
  }

  /**
   * Puts a saved snapshot back as ordinary edits of the differences, since applying an update of
   * this document's own past is a CRDT no-op.
   */
  restoreFrom(update: Uint8Array): void {
    const scratch = new Y.Doc();
    Y.applyUpdate(scratch, update);
    try {
      this.doc.transact(() => {
        for (const [name, kind] of Object.entries(RESTORE_KINDS)) {
          const key = KEYS[name as keyof typeof KEYS];
          switch (kind) {
            case 'map':
              replaceMap(this.doc.getMap(key), scratch.getMap(key));
              break;
            case 'array':
              replaceArray(this.doc.getArray(key), scratch.getArray(key));
              break;
            case 'text':
              replaceText(this.doc.getText(key), scratch.getText(key).toString());
              break;
            case 'files':
              this.restoreFiles(scratch.getMap(key));
              break;
            case 'collection':
              this.restoreCollection(this.doc.getMap(key), scratch.getMap(key));
              break;
          }
        }
      }, LOCAL_ORIGIN);
    } finally {
      scratch.destroy();
    }
  }

  // ---- seeding --------------------------------------------------------------

  /**
   * Repairs a document seeded twice, dropping only empty or identical entry files and renaming any
   * that diverged.
   */
  private dedupeEntryFile(): void {
    const mains = this.files.filter((file) => file.name === MAIN_FILE);
    if (mains.length < 2) {
      return;
    }
    const keep = mains.reduce((longest, candidate) =>
      candidate.text.length > longest.text.length ? candidate : longest,
    );
    const kept = keep.text.toString();
    for (const file of mains) {
      if (file.id === keep.id) {
        continue;
      }
      const source = file.text.toString();
      if (source === '' || source === kept) {
        this.codeFiles.delete(file.id);
      } else {
        this.codeFiles.get(file.id)?.set(ENTRY_KEYS.name, `main recovered ${file.id.slice(0, 6)}`);
      }
    }
    this.codeMeta.set(META_KEYS.entry, keep.id);
  }

  /** Draws the starter player on the first sheet, where the starter code looks for it. */
  seedDefaultSprite(colour: number): void {
    const first = this.sheets[0];
    const quads: [number, number, number][] = [
      [1, 0, 0],
      [2, 8, 0],
      [17, 0, 8],
      [18, 8, 8],
    ];
    for (const [index, sx, sy] of quads) {
      const origin = this.spriteOrigin(index);
      for (let y = 0; y < SPRITE_SIZE; y++) {
        for (let x = 0; x < SPRITE_SIZE; x++) {
          if (DEFAULT_PLAYER_SPRITE[sy + y]?.[sx + x] === 'a') {
            first?.setPixel(origin.x + x, origin.y + y, colour);
          }
        }
      }
    }
  }

  /**
   * Writes a first sheet and a first map, at the default sizes, into a document that has none,
   * under fixed keys so two clients doing it at once write the same entries. Their cells come
   * with them, so the first stroke edits the sheet rather than adding to it.
   */
  seedSheetAndMap(): void {
    this.doc.transact(() => {
      for (const [entries, id, width, height, cells] of [
        [
          this.sheetsMap,
          FIRST_SHEET_ID,
          SHEET_WIDTH,
          SHEET_HEIGHT,
          [ENTRY_KEYS.pixels, ENTRY_KEYS.flags],
        ],
        [this.mapsMap, FIRST_MAP_ID, MAP_WIDTH, MAP_HEIGHT, [ENTRY_KEYS.tiles]],
      ] as const) {
        if (entries.size > 0) {
          continue;
        }
        const entry = new Y.Map<unknown>();
        entries.set(id, entry);
        entry.set(ENTRY_KEYS.order, 0);
        entry.set(ENTRY_KEYS.width, width);
        entry.set(ENTRY_KEYS.height, height);
        for (const key of cells) {
          entry.set(key, new Y.Map<number>());
        }
      }
      this.forgetProjections();
    }, LOCAL_ORIGIN);
  }

  /**
   * Fills an empty document with the starter game. Idempotent.
   *
   * The first sheet and map are written only by the client that marks the schema: a marked
   * document gets them from its migration, and a second writer there would replace the cells it
   * moved.
   */
  seedDefaults(): void {
    this.doc.transact(() => {
      if (!this.meta.has(META_KEYS.schemaVersion)) {
        this.meta.set(META_KEYS.schemaVersion, GAME_SCHEMA_VERSION);
        this.seedSheetAndMap();
      }
      if (this.paletteArray.length !== PALETTE_SIZE) {
        this.paletteArray.delete(0, this.paletteArray.length);
        this.paletteArray.insert(0, [...BUBBLEGUM_16]);
      }
      if (this.files.length === 0) {
        this.addFile(MAIN_FILE, DEFAULT_GAME_CODE, MAIN_FILE_ID);
        if (DEFAULT_PLAYER_SPRITE_INDICES.every((i) => this.isSpriteEmpty(i))) {
          this.seedDefaultSprite(DEFAULT_SPRITE_COLOUR);
        }
      }
      this.dedupeEntryFile();
    }, LOCAL_ORIGIN);
  }
}
