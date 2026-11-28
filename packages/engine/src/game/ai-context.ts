import * as Y from 'yjs';

import { Game } from './Game';

const asJson = (entries: ReadonlyMap<string, unknown>): Record<string, string> =>
  Object.fromEntries([...entries].map(([key, value]) => [key, JSON.stringify(value)]));

/** One palette index a hex digit: a 128×128 sheet is 16 KiB of text rather than ~40 KiB of JSON. */
const hexPixels = (pixels: Uint8Array): string => {
  let out = '';
  for (const value of pixels) {
    out += (value & 15).toString(16);
  }
  return out;
};

/**
 * The game as the assistant reads it: plain data, every part of the document a tool can name, and
 * nothing beside the game: the assistant's working save is a copy of the project. It
 * carries no credentials and nothing in it is run; the assistant is told to treat it as data.
 */
export function aiContext(doc: Y.Doc): Record<string, unknown> {
  const game = new Game(doc);
  try {
    return {
      schemaVersion: game.schemaVersion,
      palette: game.palette,
      encoding: { sheetPixels: 'one hex digit per pixel, row-major' },
      code: game.files.map((file) => ({
        id: file.id,
        name: file.name,
        text: file.text.toString(),
      })),
      sheets: game.sheets.map((sheet) => ({
        id: sheet.id,
        name: sheet.name,
        width: sheet.width,
        height: sheet.height,
        base: sheet.base,
        pixels: hexPixels(sheet.pixels),
        flags: Array.from(sheet.flags),
      })),
      maps: game.maps.map((map) => ({
        id: map.id,
        name: map.name,
        width: map.width,
        height: map.height,
        tiles: Array.from(map.tiles),
      })),
      // Each entry as one JSON string, the way a tool passes it back: decoded, so an entry stored in
      // an older or a compact form reads the same as a new one.
      instruments: asJson(game.getInstruments()),
      patterns: asJson(game.getPatterns()),
      songs: asJson(game.getSongs()),
      sfx: asJson(game.getSfx()),
      samples: [...game.getSamples().keys()],
      netPermissions: Object.fromEntries(
        (() => {
          const rules: [string, unknown][] = [];
          game.netPermissions.forEach((rule, path) => {
            rules.push([path, rule]);
          });
          return rules;
        })(),
      ),
    };
  } finally {
    game.destroy();
  }
}

/** A document's whole state, as base64: how the server and the tools pass a save around. */
export function encodeState(doc: Y.Doc): string {
  const update = Y.encodeStateAsUpdate(doc);
  let binary = '';
  for (let i = 0; i < update.length; i += 8192) {
    binary += String.fromCharCode(...update.subarray(i, i + 8192));
  }
  return btoa(binary);
}

/** A document from a base64 state; the caller destroys it. */
export function decodeState(state: string): Y.Doc {
  const doc = new Y.Doc();
  Y.applyUpdate(
    doc,
    Uint8Array.from(atob(state), (char) => char.charCodeAt(0)),
  );
  return doc;
}
