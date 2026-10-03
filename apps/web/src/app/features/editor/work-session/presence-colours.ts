import type { PresenceColour } from '@naucto/ui';

const ORDER: PresenceColour[] = ['sky', 'blush', 'jade'];

/**
 * Presence colours by rank in the sorted user ids, so every peer computes the same assignment
 * without negotiating.
 */
export function assignColours(userIds: number[]): Map<number, PresenceColour> {
  const out = new Map<number, PresenceColour>();
  [...new Set(userIds)]
    .sort((a, b) => a - b)
    .forEach((id, i) => out.set(id, ORDER[i % ORDER.length] ?? 'sky'));
  return out;
}
