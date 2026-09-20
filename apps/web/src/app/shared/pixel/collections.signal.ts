import { effect, type Signal, signal } from '@angular/core';
import { type Game } from '@naucto/engine';

/**
 * Ticks when a sheet or a map is added, dropped, renamed or reordered.
 *
 * `game.sheets` and `game.maps` are plain getters, so a computed built on them would never learn
 * that a peer added a map. Read through an effect for the reason `geometrySignal` gives: the game
 * arrives as a required input.
 */
export function collectionsSignal(game: Signal<Game>): Signal<number> {
  const version = signal(0);
  effect((onCleanup) => {
    const g = game();
    version.update((v) => v + 1);
    onCleanup(
      g.onCollectionsChange(() => {
        version.update((v) => v + 1);
      }),
    );
  });

  return version.asReadonly();
}
