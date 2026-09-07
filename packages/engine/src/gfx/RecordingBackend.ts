import type { GfxBackend, ScanlineEffect } from '../api/ports';

export interface GfxCall {
  op: string;
  args: unknown[];
}

/** Test double: records every draw call. */
export class RecordingBackend implements GfxBackend {
  readonly calls: GfxCall[] = [];
  frames = 0;
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
  clear(c: number): void {
    this.rec('clear', c);
  }
  camera(x: number, y: number): void {
    this.rec('camera', x, y);
  }
  clip(x: number, y: number, w: number, h: number): void {
    this.rec('clip', x, y, w, h);
  }
  resetClip(): void {
    this.rec('resetClip');
  }
  drawSprite(...a: [number, number, number, number, number, boolean, boolean, number]): void {
    this.rec('drawSprite', ...a);
  }
  drawRegion(
    ...a: [number, number, number, number, number, number, number, number, boolean, boolean]
  ): void {
    this.rec('drawRegion', ...a);
  }
  drawMap(...a: [number, number, number, number, number, number]): void {
    this.rec('drawMap', ...a);
  }
  pixel(x: number, y: number, c: number): void {
    this.rec('pixel', x, y, c);
  }
  getPixel(): number {
    return 0;
  }
  line(...a: [number, number, number, number, number]): void {
    this.rec('line', ...a);
  }
  rect(...a: [number, number, number, number, number]): void {
    this.rec('rect', ...a);
  }
  fillRect(...a: [number, number, number, number, number]): void {
    this.rec('fillRect', ...a);
  }
  circle(...a: [number, number, number, number]): void {
    this.rec('circle', ...a);
  }
  fillCircle(...a: [number, number, number, number]): void {
    this.rec('fillCircle', ...a);
  }
  print(t: string, x: number, y: number, c: number): number {
    this.rec('print', t, x, y, c);
    return t.length * 4;
  }
  setCol(a: number, b: number): void {
    this.rec('setCol', a, b);
  }
  resetCol(): void {
    this.rec('resetCol');
  }
  setTransparent(i: number, on: boolean): void {
    this.rec('setTransparent', i, on);
  }
  setColour(i: number, hex: string): void {
    this.rec('setColour', i, hex);
  }
  getColour(): string {
    return '#000000';
  }
  resetPalette(): void {
    this.rec('resetPalette');
  }
  setPaletteRow(r: number, c: readonly string[]): void {
    this.rec('setPaletteRow', r, c);
  }
  screenCol(a: number, b: number, r: number): void {
    this.rec('screenCol', a, b, r);
  }
  scanline(y: number, fx: ScanlineEffect): void {
    this.rec('scanline', y, fx);
  }
  resetScanlines(): void {
    this.rec('resetScanlines');
  }
  persistEffects(on: boolean): void {
    this.rec('persistEffects', on);
  }
  screenshot(): Uint8ClampedArray | null {
    return null;
  }
  destroy(): void {
    this.rec('destroy');
  }
  ops(op: string): GfxCall[] {
    return this.calls.filter((c) => c.op === op);
  }
}
