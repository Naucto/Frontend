import { effect, type Signal, signal } from '@angular/core';
import { DEFAULT_GEOMETRY, type Game, type Geometry } from '@naucto/engine';

/**
 * A game's sheet and map sizes, as a signal.
 *
 * `game.geometry` is a plain getter, so a computed built on it would never learn that a peer
 * resized the sheet. Read through an effect rather than at construction, because the game arrives
 * as a required input and reading one of those before Angular sets it throws.
 */
export function geometrySignal(game: Signal<Game>): Signal<Geometry> {
  const current = signal<Geometry>(DEFAULT_GEOMETRY);
  effect((onCleanup) => {
    const currentGame = game();
    current.set(currentGame.geometry);
    onCleanup(
      currentGame.onGeometryChange(() => {
        current.set(currentGame.geometry);
      }),
    );
  });

  return current.asReadonly();
}
