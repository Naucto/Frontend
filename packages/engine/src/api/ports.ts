import type { DeclaredAction } from '../input/ActionMap';
import type { InputState } from '../input/InputState';
import type { NetPermissions } from '../net/NetPermissions';
import type { NetUi } from '../net/NetUi';

export interface ScanlineEffect {
  shiftX?: number;
  shiftY?: number;
  /** Screen palette row 0..15 */
  palette?: number;
  /** Wrap horizontally instead of clamping. */
  wrap?: boolean;
  /** Blank the row. */
  blank?: boolean;
}

/**
 * Everything the Lua `gfx` and `map` namespaces need from a renderer. A frame is
 * `begin()` … draw calls … `present()`. Coordinates are screen pixels (camera
 * offset is applied by the backend). Colours are palette indices 0..15.
 */
export interface GfxBackend {
  begin(): void;
  present(): void;
  clear(colour: number): void;
  camera(x: number, y: number): void;
  clip(x: number, y: number, w: number, h: number): void;
  resetClip(): void;
  drawSprite(
    n: number,
    x: number,
    y: number,
    w: number,
    h: number,
    flipH: boolean,
    flipV: boolean,
    scale: number,
  ): void;
  drawRegion(
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
    flipH: boolean,
    flipV: boolean,
  ): void;
  drawMap(x: number, y: number, tx: number, ty: number, tw: number, th: number): void;
  pixel(x: number, y: number, colour: number): void;
  getPixel(x: number, y: number): number;
  line(x0: number, y0: number, x1: number, y1: number, colour: number): void;
  rect(x: number, y: number, w: number, h: number, colour: number): void;
  fillRect(x: number, y: number, w: number, h: number, colour: number): void;
  circle(cx: number, cy: number, r: number, colour: number): void;
  fillCircle(cx: number, cy: number, r: number, colour: number): void;
  /** Returns the drawn width in pixels. */
  print(text: string, x: number, y: number, colour: number): number;
  setCol(from: number, to: number): void;
  resetCol(): void;
  setTransparent(index: number, on: boolean): void;
  setColour(index: number, hex: string): void;
  getColour(index: number): string;
  resetPalette(): void;
  setPaletteRow(row: number, colours: readonly string[]): void;
  screenCol(from: number, to: number, row: number): void;
  scanline(y: number, fx: ScanlineEffect): void;
  resetScanlines(): void;
  persistEffects(on: boolean): void;
  /** RGBA of the last presented frame, or null if unavailable. */
  screenshot(): Uint8ClampedArray | null;
  destroy(): void;
}

export interface SoundPort {
  playSfx(slot: number, channel: number | undefined, pitchOffset: number, volume: number): void;
  playNote(
    instrument: string,
    pitch: number,
    length: number,
    volume: number,
    channel: number | undefined,
  ): void;
  stopNote(channel: number): void;
  playMusic(song: number, loop: boolean, fadeIn: number): void;
  stopMusic(fadeOut: number): void;
  stopAll(): void;
  setVolume(master: number, music?: number, sfx?: number): void;
  musicPosition(): { pattern: number; step: number } | null;
  isPlaying(channel: number): boolean;
  /** Called once per fixed step so queued commands are flushed with the right timestamps. */
  flush(): void;
}

export interface SysPort {
  dt: number;
  frame(): number;
  time(): number;
  fps(): number;
}

export interface GameData {
  getFlag(index: number): number;
  getFlagBit(index: number, bit: number): boolean;
  getTile(x: number, y: number): number;
  /** Runtime-only tile override (not persisted). */
  setTile(x: number, y: number, sprite: number): void;
}

export type ConsoleLevel = 'log' | 'warn' | 'error';

export interface EnginePorts {
  gfx: GfxBackend;
  input: InputState;
  sound?: SoundPort;
  data: GameData;
  sys: SysPort;
  netUi?: NetUi;
  netPermissions?: NetPermissions;
  /** Called when the running game declares its action map (`input.declare`). */
  onActionsDeclared?(actions: readonly DeclaredAction[]): void;
  log(level: ConsoleLevel, text: string): void;
}
