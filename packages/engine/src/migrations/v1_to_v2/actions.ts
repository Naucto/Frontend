/**
 * The nine actions schema v1 and v2 knew, and how a v2 document kept the names a game gave them:
 * a list on `game.meta`, in this order. Frozen: it describes v2 as it was.
 */
export const V2_ACTIONS = ['left', 'right', 'up', 'down', 'a', 'b', 'x', 'y', 'pause'] as const;
export type V2Action = (typeof V2_ACTIONS)[number];

export interface V2ActionLabel {
  action: V2Action;
  label: string;
}

export const V2_LABELS_KEY = 'actions';

export const isV2Action = (value: unknown): value is V2Action =>
  typeof value === 'string' && (V2_ACTIONS as readonly string[]).includes(value);

/** The labels a `game.meta` value holds, leaving out whatever is not one. */
export function readV2Labels(raw: unknown): V2ActionLabel[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.filter(
    (entry): entry is V2ActionLabel =>
      typeof entry === 'object' &&
      entry !== null &&
      isV2Action((entry as V2ActionLabel).action) &&
      typeof (entry as V2ActionLabel).label === 'string',
  );
}
