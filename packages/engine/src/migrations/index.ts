import type * as Y from 'yjs';

import { EditableGame } from '../game/EditableGame';
import { GAME_SCHEMA_VERSION, KEYS, LEGACY_KEYS } from '../game/keys';
import { applySplices, type Splice } from './splice';
import type { MigrationReport, MigrationStep } from './types';
import { migrateV0ToV1 } from './v0_to_v1';
import { migrateV1ToV2 } from './v1_to_v2';
import { computeRenames } from './v1_to_v2/code';
import { holdsV1Shape, moveToV2Shape } from './v1_to_v2/shape';

export type { MigrationReport, MigrationStep, MigrationWarning } from './types';

export const MIGRATION_ORIGIN = 'migration';

/**
 * One step per schema version, in order; a document runs every step from the version it holds.
 *
 * A step that rewrites code reads it with the scanner in `game/luaScan` whenever finding a name is
 * enough: the scanner reads a file that does not parse, which is the state a file being edited is
 * often in, and leaves untouched everything it does not recognise. A step parses with luaparse only
 * when the rewrite needs the tree, as v0 to v1 does to reorder arguments and to know which globals
 * the game defines itself, and it then falls back to the scanner for a file that does not parse,
 * warning on each line it cannot rewrite.
 */
const STEPS: readonly MigrationStep[] = [
  { from: 0, to: 1, run: migrateV0ToV1 },
  { from: 1, to: 2, run: migrateV1ToV2 },
];

/** Content only the first schema ever wrote, and the only evidence a document predates the marker. */
function hasLegacyContent(doc: Y.Doc): boolean {
  return (
    doc.getText(LEGACY_KEYS.code).length > 0 ||
    doc.getMap(LEGACY_KEYS.sprites).size > 0 ||
    doc.getMap(LEGACY_KEYS.tiles).size > 0 ||
    doc.getArray(LEGACY_KEYS.musics).length > 0
  );
}

/**
 * Which schema a document is written in; an unmarked one is the first schema only if it holds its
 * content, otherwise it is about to be seeded at the current one.
 */
export function schemaVersionOf(doc: Y.Doc): number {
  const marked = doc.getMap(KEYS.meta).get('schemaVersion');
  if (typeof marked === 'number') {
    return marked;
  }

  return hasLegacyContent(doc) ? 0 : GAME_SCHEMA_VERSION;
}

function pendingRenames(doc: Y.Doc): { file: string; text: Y.Text; splices: Splice[] }[] {
  const game = new EditableGame(doc);
  const files = game.files;
  game.destroy();

  return files
    .map((file) => ({
      file: file.name,
      text: file.text,
      splices: computeRenames(file.text.toString()),
    }))
    .filter((entry) => entry.splices.length > 0);
}

/**
 * A document marked at the current schema that still holds some of the v1 shape, since the shape
 * moved inside v2 without a bump. An unmarked one is about to be seeded, and seeding writes the
 * current shape.
 */
function reshapedInPlace(doc: Y.Doc): boolean {
  return doc.getMap(KEYS.meta).get('schemaVersion') === GAME_SCHEMA_VERSION && holdsV1Shape(doc);
}

/**
 * Whether opening the document has to change it first.
 *
 * A schema behind is one reason; a renamed call the code still writes is another, and a v2
 * document still in the v1 shape the last, and the version tells neither, so the document is read
 * for them.
 */
export function needsMigration(doc: Y.Doc): boolean {
  return (
    schemaVersionOf(doc) < GAME_SCHEMA_VERSION ||
    reshapedInPlace(doc) ||
    pendingRenames(doc).length > 0
  );
}

/**
 * A document written at a newer schema than this build knows, which must be refused since opening a
 * session saves what it read.
 */
export function isFromFutureSchema(doc: Y.Doc): boolean {
  return schemaVersionOf(doc) > GAME_SCHEMA_VERSION;
}

/**
 * Brings a game document up to the current schema, shape and names in one transaction, so no peer
 * sees it halfway; the shape and the renames are brought at the current version and never move it.
 */
export function migrateGame(doc: Y.Doc, opts: { apply?: boolean } = {}): MigrationReport {
  const from = schemaVersionOf(doc);
  const report: MigrationReport = {
    from,
    to: GAME_SCHEMA_VERSION,
    applied: false,
    counts: {},
    warnings: [],
  };
  const behind = from < GAME_SCHEMA_VERSION;
  const reshape = !behind && reshapedInPlace(doc);
  let renames = behind ? [] : pendingRenames(doc);
  if (!behind && !reshape && renames.length === 0) {
    return report;
  }
  if (opts.apply === false) {
    return report;
  }

  const meta = doc.getMap(KEYS.meta);
  doc.transact(() => {
    if (behind) {
      for (const step of STEPS) {
        if (step.from >= from) {
          step.run(doc, report);
        }
      }
      meta.set('schemaVersion', GAME_SCHEMA_VERSION);
      meta.set('migratedFrom', from);
      meta.set('migratedAt', new Date().toISOString());
      renames = pendingRenames(doc);
    }
    if (reshape) {
      report.counts.reshaped = moveToV2Shape(doc);
    }
    for (const rename of renames) {
      report.counts[`rewrites:${rename.file}`] = applySplices(rename.text, rename.splices);
    }
  }, MIGRATION_ORIGIN);
  report.applied = true;

  return report;
}
