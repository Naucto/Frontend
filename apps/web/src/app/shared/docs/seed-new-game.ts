import type { TutorialAssets } from '@naucto/engine';

import { type DocPage } from './docs.service';

/**
 * Session-storage key of a docs page's game: the new-game page takes the bare key and re-files the
 * seed under `naucto.seed.<project id>`, which is the only one the editor reads.
 */
export const SEED_KEY = 'naucto.seed';

export interface GameSeed {
  name: string;
  code: string;
  assets: TutorialAssets | null;
}

/** Leaves a tutorial's code, sheet, map and name for the next game created. */
export function seedNewGame(p: DocPage): void {
  if (!p.lua) return;
  const seed: GameSeed = { name: p.title.replace(/^Build /, ''), code: p.lua, assets: p.assets };
  sessionStorage.setItem(SEED_KEY, JSON.stringify(seed));
}
