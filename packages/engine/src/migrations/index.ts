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

/** One step per schema version, in order; a document runs every step from the version it holds. */
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
  if (typeof marked === 'number') return marked;

  return hasLegacyContent(doc) ? 0 : GAME_SCHEMA_VERSION;
}

function pendingRenames(doc: Y.Doc): { file: string; text: Y.Text; splices: Splice[] }[] {
  const game = new Game(doc);
  const files = game.files;
  game.destroy();

  return files
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
 * A document written at a newer schema than this build knows, which must be refused since opening a
 * session saves what it read.
 */
export function isFromFutureSchema(doc: Y.Doc): boolean {
  return schemaVersionOf(doc) > GAME_SCHEMA_VERSION;
}

/**
 * Brings a game document up to the current schema and names in one transaction, so no peer sees it
 * halfway; renames run at any version and never move it.
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
