import type * as Y from 'yjs';

import { EditableGame } from '../../game/EditableGame';
import { ACTIONS, type DeclaredAction } from '../../input/ActionMap';
import type { MigrationReport } from '../types';
import { migrateCode } from './code';
import { moveToV2Shape } from './shape';

/**
 * The second schema: `input.held`, `input.pressed` and `input.released` in place of `btn`, `btnp`
 * and `btnr`, the action labels on the document instead of an `input.declare` call, and every sheet
 * and map an entry of its collection holding its own cells and size.
 *
 * Every label the code declared lands in `meta.actions`, later files and later calls winning as
 * the last call did at runtime, over whatever the document already held.
 */
export function migrateV1ToV2(doc: Y.Doc, report: MigrationReport): void {
  report.counts.reshaped = moveToV2Shape(doc);
  const game = new EditableGame(doc);
  const labels = new Map<DeclaredAction['action'], string>(
    game.declaredActions.map((declared) => [declared.action, declared.label]),
  );
  let found = 0;
  for (const file of game.files) {
    for (const declared of migrateCode(file.text, report, file.name)) {
      labels.set(declared.action, declared.label);
      found += 1;
    }
  }
  if (found > 0) {
    game.setDeclaredActions(
      ACTIONS.filter((action) => labels.has(action)).map((action) => ({
        action,
        label: labels.get(action) ?? '',
      })),
    );
  }
  game.destroy();
}
