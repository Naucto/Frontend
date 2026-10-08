import type { DisplayEffect, GfxBackend } from '../api/ports';

export interface GfxCall {
  op: string;
  args: unknown[];
}

/** Test double: records every draw call, and keeps a frame palette so a read gives back a write. */
export class RecordingBackend implements GfxBackend {
  readonly calls: GfxCall[] = [];
  frames = 0;
  private readonly palette: string[] = Array.from({ length: 16 }, () => '#000000');
  private rec(op: string, ...args: unknown[]): void {
    this.calls.push({ op, args });
  }
  begin(): void {
    this.rec('begin');
  }
  present(): void {
    this.frames++;
    this.rec('present');
  }
  clear(colour: number): void {
    this.rec('clear', colour);
  }
  setTileOverride(x: number, y: number, sprite: number, map: number): void {
    this.rec('setTileOverride', x, y, sprite, map);
  }
  clearTileOverrides(): void {
    this.rec('clearTileOverrides');
  }
  camera(x: number, y: number): void {
    this.rec('camera', x, y);
  }
  clip(x: number, y: number, width: number, height: number): void {
    this.rec('clip', x, y, width, height);
  }
  resetClip(): void {
    this.rec('resetClip');
  }
  drawSprite(...args: [number, number, number, number, number, boolean, boolean, number]): void {
    this.rec('drawSprite', ...args);
  }
  drawRegion(
    ...args: [number, number, number, number, number, number, number, number, boolean, boolean]
  ): void {
    this.rec('drawRegion', ...args);
  }
  drawMap(...args: [number, number, number, number, number, number, number]): void {
    this.rec('drawMap', ...args);
  }
  pixel(x: number, y: number, colour: number): void {
    this.rec('pixel', x, y, colour);
  }
  getPixel(): number {
    return 0;
  }
  line(...args: [number, number, number, number, number]): void {
    this.rec('line', ...args);
  }
  rect(...args: [number, number, number, number, number]): void {
    this.rec('rect', ...args);
  }
  fillRect(...args: [number, number, number, number, number]): void {
    this.rec('fillRect', ...args);
  }
  circle(...args: [number, number, number, number]): void {
    this.rec('circle', ...args);
  }
  fillCircle(...args: [number, number, number, number]): void {
    this.rec('fillCircle', ...args);
  }
  print(text: string, x: number, y: number, colour: number): number {
    this.rec('print', text, x, y, colour);
    return text.length * 4;
  }
  setCol(from: number, to: number): void {
    this.rec('setCol', from, to);
  }
  resetCol(): void {
    this.rec('resetCol');
  }
  setColour(i: number, hex: string): void {
    this.rec('setColour', i, hex);
    this.palette[i & 15] = hex;
  }
  getColour(i: number): string {
    return this.palette[i & 15] ?? '#000000';
  }
  resetPalette(): void {
    this.rec('resetPalette');
    this.palette.fill('#000000');
  }
  screenCol(from: number, to: number): void {
    this.rec('screenCol', from, to);
    this.palette[from & 15] = this.palette[to & 15] ?? '#000000';
  }
  setFrameEffect(fx: DisplayEffect): void {
    this.rec('setFrameEffect', fx);
  }
  setLinePalette(y: number, colours: readonly string[]): void {
    this.rec('setLinePalette', y, colours);
  }
  setLineEffect(y: number, fx: DisplayEffect): void {
    this.rec('setLineEffect', y, fx);
  }
  screenshot(): Uint8ClampedArray | null {
    return null;
  }
  destroy(): void {
    this.rec('destroy');
  }
  ops(op: string): GfxCall[] {
    return this.calls.filter((call) => call.op === op);
  }
}
