import type { ActionDraft } from './actions';
import { type ActionTable, buildActionTable } from './ActionTable';
import { INPUT_PRESETS } from './presets';

/** The table of a list of drafts, numbered in order as a document would hold them. */
export const tableOf = (drafts: readonly ActionDraft[] = INPUT_PRESETS.classic): ActionTable =>
  buildActionTable(drafts.map((draft, order) => ({ ...draft, id: draft.name, order })));
