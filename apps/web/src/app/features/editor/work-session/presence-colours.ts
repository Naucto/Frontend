import type { PresenceColour } from '@naucto/ui';

import { compareIds } from '../../../core/ids/ids';

const ORDER: PresenceColour[] = ['sky', 'blush', 'jade'];

/**
 * Presence colours by rank in the sorted user ids, so every peer computes the same assignment
 * without negotiating.
 */
export function assignColours(userIds: string[]): Map<string, PresenceColour> {
  const out = new Map<string, PresenceColour>();
  [...new Set(userIds)]
    .sort(compareIds)
    .forEach((id, i) => out.set(id, ORDER[i % ORDER.length] ?? 'sky'));
  return out;
}
