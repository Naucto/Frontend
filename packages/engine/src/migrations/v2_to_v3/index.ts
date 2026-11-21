import * as Y from 'yjs';

import { KEYS } from '../../game/keys';
import type { MigrationReport } from '../types';
import { moveToV2Shape } from '../v1_to_v2/shape';
import {
  V2_ACTIONS,
  V2_DEFAULT_KEYS,
  V2_DEFAULT_LABELS,
  V2_DEFAULT_PAD,
  V2_LABELS_KEY,
  V3_ACTIONS,
} from './legacy';

/**
 * The third schema: a game holds its own actions, each with the inputs plugged into it, where v2
 * had nine fixed ones a player could rebind.
 *
 * Every game gets the nine, under their names and with the default bindings, so its code reads
 * what it read and a player presses what the defaults had them press; an action the game named on
 * `game.meta` keeps that name as its label. The v2 shape moved without a bump, so a v2 document
 * may still hold the older one and is brought to it first.
 */
export function migrateV2ToV3(doc: Y.Doc, report: MigrationReport): void {
  report.counts.reshaped = (report.counts.reshaped ?? 0) + moveToV2Shape(doc);
  const meta = doc.getMap(KEYS.meta);
  const named = meta.get(V2_LABELS_KEY);
  const labels = new Map<unknown, unknown>(
    (Array.isArray(named) ? (named as unknown[]) : [])
      .filter((entry) => typeof entry === 'object' && entry !== null)
      .map((entry) => [
        (entry as Record<string, unknown>).action,
        (entry as Record<string, unknown>).label,
      ]),
  );
  meta.delete(V2_LABELS_KEY);

  const actions = doc.getMap<Y.Map<unknown>>(V3_ACTIONS.root);
  actions.clear();
  let labelled = 0;
  V2_ACTIONS.forEach((action, order) => {
    const authored = labels.get(action);
    const label = typeof authored === 'string' ? authored.trim() : '';
    labelled += label === '' ? 0 : 1;
    const entry = new Y.Map<unknown>();
    const inputs = new Y.Map<number>();
    actions.set(action, entry);
    entry.set(V3_ACTIONS.name, action);
    entry.set(V3_ACTIONS.label, label || V2_DEFAULT_LABELS[action]);
    entry.set(V3_ACTIONS.description, '');
    entry.set(V3_ACTIONS.order, order);
    entry.set(V3_ACTIONS.inputs, inputs);
    [
      ...V2_DEFAULT_KEYS.flatMap((keys, player) =>
        keys[action].map((key) => V3_ACTIONS.key(player, key)),
      ),
      ...V2_DEFAULT_PAD[action].map(V3_ACTIONS.pad),
    ].forEach((input, rank) => {
      inputs.set(input, rank);
    });
  });
  report.counts.actions = V2_ACTIONS.length;
  report.counts.actionLabels = labelled;
}
