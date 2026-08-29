import type * as Y from 'yjs';

import { Game } from '../game/Game';
import { GAME_SCHEMA_VERSION, KEYS, LEGACY_KEYS } from '../game/keys';
import type { MigrationReport } from './types';
import { migrateCode } from './v0_to_v1/code';
import { migrateData } from './v0_to_v1/data';
import { migrateSound } from './v0_to_v1/sound';

export type { MigrationReport, MigrationWarning } from './types';

export const MIGRATION_ORIGIN = 'migration';

/** True when the document carries v0 content and no v1 schema marker. */
export function needsMigration(doc: Y.Doc): boolean {
  const meta = doc.getMap(KEYS.meta);
  if (typeof meta.get('schemaVersion') === 'number') return false;
  return (
    doc.getText(LEGACY_KEYS.code).length > 0 ||
    doc.getMap(LEGACY_KEYS.sprites).size > 0 ||
    doc.getMap(LEGACY_KEYS.tiles).size > 0 ||
    doc.getArray(LEGACY_KEYS.musics).length > 0
  );
}

/**
 * Upgrades a game document to the current schema in one transaction. Runs
 * only when needed; a fresh document is seeded by Game.seedDefaults instead.
 */
export function migrateGame(doc: Y.Doc, opts: { apply?: boolean } = {}): MigrationReport {
  const report: MigrationReport = {
    from: 0,
    to: GAME_SCHEMA_VERSION,
    applied: false,
    counts: {},
    warnings: [],
  };
  const meta = doc.getMap(KEYS.meta);
  const current =
    typeof meta.get('schemaVersion') === 'number' ? (meta.get('schemaVersion') as number) : 0;
  report.from = current;
  if (current >= GAME_SCHEMA_VERSION || !needsMigration(doc)) return report;
  if (opts.apply === false) return report;

  doc.transact(() => {
    migrateData(doc, report);
    migrateSound(doc, report);
    const game = new Game(doc);
    for (const f of game.files) migrateCode(f.text, report, f.name);
    meta.set('schemaVersion', GAME_SCHEMA_VERSION);
    meta.set('migratedFrom', current);
    meta.set('migratedAt', new Date().toISOString());
    meta.set('compat', true);
  }, MIGRATION_ORIGIN);
  report.applied = true;
  return report;
}
