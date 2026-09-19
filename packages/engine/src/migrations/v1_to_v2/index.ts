import type * as Y from 'yjs';

import { Game } from '../../game/Game';
import { ACTIONS, type DeclaredAction } from '../../input/ActionMap';
import type { MigrationReport } from '../types';
import { migrateCode } from './code';

/**
 * The second schema: `input.held`, `input.pressed` and `input.released` in place of `btn`, `btnp`
 * and `btnr`, and the action labels on the document instead of an `input.declare` call.
 *
 * Every label the code declared lands in `meta.actions`, later files and later calls winning as
 * the last call did at runtime, over whatever the document already held. The keys change nothing:
 * `compat` stays as the first step left it.
 */
export function migrateV1ToV2(doc: Y.Doc, report: MigrationReport): void {
  const game = new Game(doc);
  const labels = new Map<DeclaredAction['action'], string>(
    game.declaredActions.map((a) => [a.action, a.label]),
  );
  let found = 0;
  for (const f of game.files)
    for (const a of migrateCode(f.text, report, f.name)) {
      labels.set(a.action, a.label);
      found += 1;
    }
  if (found === 0) return;
  game.setDeclaredActions(
    ACTIONS.filter((a) => labels.has(a)).map((action) => ({
      action,
      label: labels.get(action) ?? '',
    })),
  );
}
