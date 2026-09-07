import type { PresenceColour } from '@naucto/ui';

const ORDER: PresenceColour[] = ['sky', 'blush', 'jade'];

/**
 * Each collaborator gets one of three presence colours for the whole session.
 * Deterministic from the sorted set of user ids so every peer agrees without
 * negotiation; the local user is always included.
 */
export function assignColours(userIds: number[]): Map<number, PresenceColour> {
  const out = new Map<number, PresenceColour>();
  [...new Set(userIds)]
    .sort((a, b) => a - b)
    .forEach((id, i) => out.set(id, ORDER[i % ORDER.length] ?? 'sky'));
  return out;
}
