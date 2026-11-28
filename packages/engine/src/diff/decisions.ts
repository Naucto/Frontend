import type { ChangeItem } from './changes';

/** Where a person stands on one change. */
export type Decision = 'pending' | 'ok' | 'no';

/** The decisions taken so far, by change key. A key absent is pending. */
export type Decisions = ReadonlyMap<string, Decision>;

/**
 * Takes `decision` on every change of `keys` and on everything they pull with them, and answers
 * the decisions that result. Accepting a change accepts what it needs; rejecting one rejects what
 * needs it; both run to the end of the chain. Setting a change back to pending touches it alone.
 */
export function decide(
  items: readonly ChangeItem[],
  decisions: Decisions,
  keys: readonly string[],
  decision: Decision,
): Map<string, Decision> {
  const byKey = new Map(items.map((item) => [item.key, item]));
  const next = new Map(decisions);
  const queue = [...keys];
  const seen = new Set<string>();
  while (queue.length) {
    const key = queue.shift() ?? '';
    if (seen.has(key) || !byKey.has(key)) {
      continue;
    }
    seen.add(key);
    if (decision === 'pending') {
      next.delete(key);
      continue;
    }
    next.set(key, decision);
    const deps = byKey.get(key)?.deps;
    queue.push(...((decision === 'ok' ? deps?.onAccept : deps?.onReject) ?? []));
  }
  return next;
}

/** The decision on one change. */
export const decisionOf = (decisions: Decisions, key: string): Decision =>
  decisions.get(key) ?? 'pending';

/** Drops what was decided about changes the snapshots no longer hold. */
export function keepLive(
  items: readonly ChangeItem[],
  decisions: Decisions,
): Map<string, Decision> {
  const live = new Set(items.map((item) => item.key));
  return new Map([...decisions].filter(([key]) => live.has(key)));
}
