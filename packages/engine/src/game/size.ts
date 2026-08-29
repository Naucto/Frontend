import * as Y from 'yjs';

import type { Game } from './Game';

export interface SizeReport {
  code: number;
  /** Sprite pixels, sprite flags and the 16-slot palette — every graphics byte. */
  sprites: number;
  map: number;
  sound: number;
  total: number;
  /** Size of the full encoded Yjs update (what is uploaded). */
  encoded: number;
}

const utf8 = (s: string): number => new TextEncoder().encode(s).length;

/** Effective content size of a game: what the player would download, not CRDT history. */
export function computeSizeReport(game: Game): SizeReport {
  let code = 0;
  for (const f of game.files) code += utf8(f.text.toString());
  let sprites = 0;
  for (const v of game.sheet) if (v !== 0) sprites++;
  sprites += game.flags.reduce((n, f) => n + (f !== 0 ? 1 : 0), 0);
  let map = 0;
  for (const v of game.tiles) if (v !== 0) map++;
  let sound = 0;
  for (const m of [game.instruments, game.patterns, game.songs, game.sfx, game.samples])
    m.forEach((v) => (sound += utf8(v)));
  // The palette is a graphics cost, counted with the sprites: the size breakdown the editor draws
  // has four segments, and they must add up to the total shown beside them.
  sprites += game.paletteArray.length * 7;
  const total = code + sprites + map + sound;
  return {
    code,
    sprites,
    map,
    sound,
    total,
    encoded: Y.encodeStateAsUpdate(game.doc).byteLength,
  };
}
