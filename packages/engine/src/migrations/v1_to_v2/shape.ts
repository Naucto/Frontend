import * as Y from 'yjs';

import { clampMapSize, clampSheetSize } from '../../game/geometry';
import {
  ENTRY_KEYS,
  FIRST_MAP_ID,
  FIRST_SHEET_ID,
  KEYS,
  MAP_HEIGHT,
  MAP_WIDTH,
  SHEET_HEIGHT,
  SHEET_WIDTH,
} from '../../game/keys';

/**
 * Where schema v1 kept the cells of its first sheet and first map, as document roots rather than on
 * their collection entries. Frozen: it describes v1 as it was.
 */
export const V1_ROOTS = {
  sprites: 'gfx.sprites',
  flags: 'gfx.flags',
  tiles: 'map.tiles',
} as const;

/** The size schema v1 recorded on `game.meta`, which an entry stating none of its own took. */
export const V1_GEOMETRY_KEYS = {
  sheetWidth: 'sheetWidth',
  sheetHeight: 'sheetHeight',
  mapWidth: 'mapWidth',
  mapHeight: 'mapHeight',
} as const;

/** One collection, and where schema v1 kept what now belongs on its entries. */
interface Collection {
  key: string;
  firstId: string;
  /** Each root holding the first entry's cells, with the entry field they move to. */
  roots: readonly (readonly [root: string, field: string])[];
  width: { meta: string; fallback: number };
  height: { meta: string; fallback: number };
  clamp: (size: number) => number;
}

const COLLECTIONS: readonly Collection[] = [
  {
    key: KEYS.sheets,
    firstId: FIRST_SHEET_ID,
    roots: [
      [V1_ROOTS.sprites, ENTRY_KEYS.pixels],
      [V1_ROOTS.flags, ENTRY_KEYS.flags],
    ],
    width: { meta: V1_GEOMETRY_KEYS.sheetWidth, fallback: SHEET_WIDTH },
    height: { meta: V1_GEOMETRY_KEYS.sheetHeight, fallback: SHEET_HEIGHT },
    clamp: clampSheetSize,
  },
  {
    key: KEYS.maps,
    firstId: FIRST_MAP_ID,
    roots: [[V1_ROOTS.tiles, ENTRY_KEYS.tiles]],
    width: { meta: V1_GEOMETRY_KEYS.mapWidth, fallback: MAP_WIDTH },
    height: { meta: V1_GEOMETRY_KEYS.mapHeight, fallback: MAP_HEIGHT },
    clamp: clampMapSize,
  },
];

const isSize = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

/** An instrument as stored, with what the synth reads every sample filled in; null if it has it. */
function settledInstrument(raw: string): string | null {
  let instrument: unknown;
  try {
    instrument = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof instrument !== 'object' || instrument === null) {
    return null;
  }
  const fields = instrument as Record<string, unknown>;
  let changed = false;
  for (const key of ['detune', 'glide']) {
    if (typeof fields[key] !== 'number') {
      fields[key] = 0;
      changed = true;
    }
  }
  // An empty `steps` list meant off, which only a zero rate says now.
  const arp = fields.arp as { steps?: unknown } | undefined;
  if (Array.isArray(arp?.steps) && arp.steps.length === 0) {
    fields.arp = { rate: 0 };
    changed = true;
  }

  return changed ? JSON.stringify(fields) : null;
}

/**
 * Whether a document still holds anything of the v1 shape: cells in the roots, a size on the meta,
 * a collection without entries or an entry without a size, an instrument the synth cannot read.
 */
export function holdsV1Shape(doc: Y.Doc): boolean {
  const meta = doc.getMap(KEYS.meta);
  const collectionsOld = COLLECTIONS.some((collection) => {
    const entries = doc.getMap<Y.Map<unknown>>(collection.key);
    let sizeless = false;
    entries.forEach((entry) => {
      sizeless ||= !isSize(entry.get(ENTRY_KEYS.width)) || !isSize(entry.get(ENTRY_KEYS.height));
    });

    return (
      entries.size === 0 ||
      sizeless ||
      meta.has(collection.width.meta) ||
      meta.has(collection.height.meta) ||
      collection.roots.some(([root]) => doc.getMap(root).size > 0)
    );
  });
  let instrumentsOld = false;
  doc.getMap<string>(KEYS.instruments).forEach((raw) => {
    instrumentsOld ||= settledInstrument(raw) !== null;
  });

  return collectionsOld || instrumentsOld;
}

/**
 * Brings a document to the v2 shape: every sheet and map an entry of its collection holding its own
 * cells and size, the v1 roots and meta sizes emptied, every instrument complete. Idempotent;
 * returns how many things it changed.
 *
 * The first entry takes the root cells, replacing any of its own, since v1 read the roots for it.
 * A collection that has entries but none under the first id never showed the roots, so they go.
 */
export function moveToV2Shape(doc: Y.Doc): number {
  const meta = doc.getMap(KEYS.meta);
  let changes = 0;
  for (const collection of COLLECTIONS) {
    const entries = doc.getMap<Y.Map<unknown>>(collection.key);
    if (entries.size === 0) {
      const first = new Y.Map<unknown>();
      entries.set(collection.firstId, first);
      first.set(ENTRY_KEYS.order, 0);
      changes += 1;
    }
    const recorded = {
      width: meta.get(collection.width.meta),
      height: meta.get(collection.height.meta),
    };
    const width = collection.clamp(
      isSize(recorded.width) ? recorded.width : collection.width.fallback,
    );
    const height = collection.clamp(
      isSize(recorded.height) ? recorded.height : collection.height.fallback,
    );
    entries.forEach((entry) => {
      if (!isSize(entry.get(ENTRY_KEYS.width))) {
        entry.set(ENTRY_KEYS.width, width);
        changes += 1;
      }
      if (!isSize(entry.get(ENTRY_KEYS.height))) {
        entry.set(ENTRY_KEYS.height, height);
        changes += 1;
      }
    });
    const first = entries.get(collection.firstId);
    for (const [rootKey, field] of collection.roots) {
      const root = doc.getMap<number>(rootKey);
      if (root.size === 0) {
        continue;
      }
      if (first) {
        const cells = new Y.Map<number>();
        root.forEach((value, key) => {
          cells.set(key, value);
        });
        first.set(field, cells);
      }
      root.clear();
      changes += 1;
    }
    for (const key of [collection.width.meta, collection.height.meta]) {
      if (meta.has(key)) {
        meta.delete(key);
        changes += 1;
      }
    }
  }

  const instruments = doc.getMap<string>(KEYS.instruments);
  const settled: [string, string][] = [];
  instruments.forEach((raw, id) => {
    const next = settledInstrument(raw);
    if (next !== null) {
      settled.push([id, next]);
    }
  });
  for (const [id, next] of settled) {
    instruments.set(id, next);
  }

  return changes + settled.length;
}
