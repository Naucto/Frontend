import { Injectable } from '@angular/core';
import { Game, isFromFutureSchema, migrateGame } from '@naucto/engine';
import * as Y from 'yjs';

/** Loads a published release blob into an in-memory game document (migrated, never persisted). */
@Injectable({ providedIn: 'root' })
export class ReleaseGameService {
  async load(signedUrl: string): Promise<Game> {
    const res = await fetch(signedUrl);
    if (!res.ok) throw new Error(`content ${String(res.status)}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const doc = new Y.Doc();
    if (bytes.byteLength > 0) Y.applyUpdate(doc, bytes);
    // Nothing here writes back, so a newer document could only be *shown* wrong -- which for a
    // published game is the whole of it. Saying so beats drawing a game with pieces missing.
    if (isFromFutureSchema(doc)) throw new Error('This game needs a newer version of Naucto');
    migrateGame(doc);
    const game = new Game(doc);
    game.seedDefaults();
    return game;
  }
}
