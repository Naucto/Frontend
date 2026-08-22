// Nothing under `src/engine` may import from `@providers`/`@shared`/`@modules`;
// the app supplies implementations of these ports at the composition root.

export type QueueSpriteDrawFn = (
  index: number,
  x: number,
  y: number,
  width?: number,
  height?: number,
  flip_h?: boolean,
  flip_v?: boolean,
  scale?: number,
) => void;

export type Renderer = {
  queueSpriteDraw: QueueSpriteDrawFn;
  draw: () => void;
  drawMap: (x: number, y: number) => void;
  clear: (index: number) => void;
  setColor: (index: number, index2: number) => void;
  resetColor: () => void;
  moveCamera: (x: number, y: number) => void;
  drawLine: (col: number, x0: number, y0: number, x1: number, y1: number) => void;
  drawOutlineRect: (
    col: number,
    x: number,
    y: number,
    width: number,
    height: number,
  ) => void;
  drawRect: (
    col: number,
    x: number,
    y: number,
    width: number,
    height: number,
  ) => void;
  getCanvas?: () => HTMLCanvasElement | null;
};

export interface SpriteSource {
  getFlag(index: number): number;
  getFlagBit(index: number, bit: number): boolean;
}

export interface MapSource {
  getTileAt(pos: Point2D): number;
}

export interface InputSource {
  isKeyPressed(key: string): boolean;
}

export interface SoundPlayer {
  play(index?: number): Promise<void>;
  stop(): void;
}
