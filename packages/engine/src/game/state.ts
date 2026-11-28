import * as Y from 'yjs';

import { isFromFutureSchema, migrateGame } from '../migrations';
import { EditableGame } from './EditableGame';

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

/** A saved state opened to be read or edited outside the editor; `close` it when done. */
export interface OpenState {
  game: EditableGame;
  /** The state as it stands now, edits included. */
  save(): string;
  close(): void;
}

/**
 * Opens a base64 state as a game of the current schema: what every tool outside the editor reads
 * and writes a save through. A save of an older schema is migrated first, as the editor does on
 * opening one, and one of a newer schema is refused rather than misread.
 */
export function openState(state: string): OpenState {
  const doc = decodeState(state);
  if (isFromFutureSchema(doc)) {
    doc.destroy();
    throw new Error('This save was made by a newer version of Naucto');
  }
  migrateGame(doc);
  const game = new EditableGame(doc);
  return {
    game,
    save: () => encodeState(doc),
    close: () => {
      game.destroy();
      doc.destroy();
    },
  };
}
