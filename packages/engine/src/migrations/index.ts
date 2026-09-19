import type * as Y from 'yjs';

import { Game } from '../game/Game';
import { GAME_SCHEMA_VERSION, KEYS, LEGACY_KEYS } from '../game/keys';
import { applySplices, type Splice } from './splice';
import type { MigrationReport, MigrationStep } from './types';
import { migrateV0ToV1 } from './v0_to_v1';
import { migrateV1ToV2 } from './v1_to_v2';
import { computeRenames } from './v1_to_v2/code';

export type { MigrationReport, MigrationStep, MigrationWarning } from './types';

export const MIGRATION_ORIGIN = 'migration';

/**
 * One entry per schema version, in order, each picking up where the previous left off.
 *
 * A document is brought forward by running every step from the version it holds, so a game written
 * two schemas ago crosses both rather than needing a step of its own.
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
 * Which schema a document is written in.
 *
 * An unmarked document is the first schema only if it holds content from it. Unmarked and empty is
 * a document nobody has written yet, and it is about to be seeded at the current schema -- calling
 * that one out of date would run every migration over an empty document and seed it twice.
 */
export function schemaVersionOf(doc: Y.Doc): number {
  const marked = doc.getMap(KEYS.meta).get('schemaVersion');
  if (typeof marked === 'number') return marked;

  return hasLegacyContent(doc) ? 0 : GAME_SCHEMA_VERSION;
}

function pendingRenames(doc: Y.Doc): { file: string; text: Y.Text; splices: Splice[] }[] {
  return new Game(doc).files
    .map((f) => ({ file: f.name, text: f.text, splices: computeRenames(f.text.toString()) }))
    .filter((r) => r.splices.length > 0);
}

/**
 * Whether opening the document has to change it first.
 *
 * A schema behind is one reason; a renamed call the code still writes is the other, and the
 * version cannot tell that one, so the files are read for it.
 */
export function needsMigration(doc: Y.Doc): boolean {
  return schemaVersionOf(doc) < GAME_SCHEMA_VERSION || pendingRenames(doc).length > 0;
}

/**
 * A document written by a newer build than this one.
 *
 * There is no migration backwards and no way to guess what a later schema meant, so the only safe
 * answer is to refuse it. Reading it anyway would show a game with pieces missing, and editing it
 * -- which the host does automatically, since opening a session saves -- would write that partial
 * reading back over the whole.
 */
export function isFromFutureSchema(doc: Y.Doc): boolean {
  return schemaVersionOf(doc) > GAME_SCHEMA_VERSION;
}

/**
 * Brings a game document up to the current schema and to the current names, in one transaction.
 *
 * One transaction for however many steps it takes: a document halfway between two schemas is a
 * document no reader knows how to hold, and a peer joining mid-migration would see exactly that.
 *
 * The renames run whatever the version says and never move it: a document at the current schema
 * is left exactly as it is unless a file still writes an old name.
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
  let renames = behind ? [] : pendingRenames(doc);
  if (!behind && renames.length === 0) return report;
  if (opts.apply === false) return report;

  const meta = doc.getMap(KEYS.meta);
  doc.transact(() => {
    if (behind) {
      for (const step of STEPS) if (step.from >= from) step.run(doc, report);
      meta.set('schemaVersion', GAME_SCHEMA_VERSION);
      meta.set('migratedFrom', from);
      meta.set('migratedAt', new Date().toISOString());
      renames = pendingRenames(doc);
    }
    for (const r of renames) report.counts[`rewrites:${r.file}`] = applySplices(r.text, r.splices);
  }, MIGRATION_ORIGIN);
  report.applied = true;

  return report;
}
