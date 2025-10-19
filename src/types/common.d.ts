type Maybe<T> = T | undefined;

type Point2D = {
  x: number;
  y: number;
}

type Size = {
  width: number;
  height: number;
}

type RawContentListener = (content: string) => void;
type ContentListener = (content: number[]) => void;

interface Destroyable {
  destroy(): void;
}
