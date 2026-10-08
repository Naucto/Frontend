import * as Y from 'yjs';

import type { EditableGame } from './EditableGame';

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

const utf8 = (text: string): number => new TextEncoder().encode(text).length;

/** Effective content size of a game: what the player would download, not CRDT history. */
export function computeSizeReport(game: EditableGame): SizeReport {
  let code = 0;
  for (const file of game.files) {
    code += utf8(file.text.toString());
  }
  // Every sheet and map counts, since this meter gates publishing.
  let sprites = 0;
  for (const sheet of game.sheets) {
    for (const pixel of sheet.pixels) {
      if (pixel !== 0) {
        sprites++;
      }
    }
    sprites += sheet.flags.reduce((count, flag) => count + (flag !== 0 ? 1 : 0), 0);
  }
  let map = 0;
  for (const gameMap of game.maps) {
    for (const tile of gameMap.tiles) {
      if (tile !== 0) {
        map++;
      }
    }
  }
  let sound = 0;
  for (const collection of [game.instruments, game.patterns, game.songs, game.sfx, game.samples]) {
    collection.forEach((entry) => (sound += utf8(entry)));
  }
  // The palette counts as graphics, so the four segments add up to the total.
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
