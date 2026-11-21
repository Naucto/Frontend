import type { ChipTone } from '@naucto/ui';

/** The colour of each of the four players, wherever one is named. */
export const PLAYER_TONES = ['gold', 'sky', 'jade', 'hot'] as const satisfies readonly ChipTone[];
export type PlayerTone = (typeof PLAYER_TONES)[number];
