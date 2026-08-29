import { Injectable } from '@angular/core';
import { Game, migrateGame } from '@naucto/engine';
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
    migrateGame(doc);
    const game = new Game(doc);
    game.seedDefaults();
    return game;
  }
}
