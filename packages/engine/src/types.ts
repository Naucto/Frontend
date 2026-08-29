/** Shared structural types used across the engine. */
export interface Point2D {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export type Maybe<T> = T | undefined;

export interface Destroyable {
  destroy(): void;
}
