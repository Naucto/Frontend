import { Injectable } from '@angular/core';
import { type Game, openGame } from '@naucto/engine';

/** Loads a published release blob into an in-memory game document (migrated, never persisted). */
@Injectable({ providedIn: 'root' })
export class ReleaseGameService {
  async load(signedUrl: string): Promise<Game> {
    const res = await fetch(signedUrl);
    if (!res.ok) {
      throw new Error(`content ${String(res.status)}`);
    }
    return openGame(new Uint8Array(await res.arrayBuffer()));
  }
}
