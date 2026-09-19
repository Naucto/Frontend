import type { DeclaredAction } from '../input/ActionMap';
import type { InputState } from '../input/InputState';
import type { NetPermissions } from '../net/NetPermissions';
import type { NetUi } from '../net/NetUi';
import type { Envelope, Instrument, Pattern, Song } from '../sound/model';

/**
 * What the display does to the finished picture, for the whole frame or for one line of it:
 * a whole-pixel shift in game coordinates (positive y moves the picture down), read back through
 * the shift either wrapping sideways or uncovering colour 0, or black instead of any of it.
 */
export interface DisplayEffect {
  shiftX: number;
  shiftY: number;
  wrap: boolean;
  blank: boolean;
}

export const NO_EFFECT: DisplayEffect = { shiftX: 0, shiftY: 0, wrap: false, blank: false };

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
    /** The palette index kept clear, or null to draw every colour. */
    keyColour: number | null,
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
    keyColour: number | null,
  ): void;
  /** `map` is the map's index in the order the game lists them, counted from 0. */
  drawMap(x: number, y: number, tx: number, ty: number, tw: number, th: number, map: number): void;
  /**
   * A tile the running game changed, which the document does not hold.
   *
   * The map is drawn from a texture built out of the document, so a change nothing writes there is
   * a change the screen cannot find on its own.
   */
  setTileOverride(x: number, y: number, sprite: number, map: number): void;
  /** Back to the document's own map, for a game starting over. */
  clearTileOverrides(): void;
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
  /** The frame palette: what every line shows unless it was given a palette of its own. */
  setColour(index: number, hex: string): void;
  getColour(index: number): string;
  /** The frame palette back to the document's. */
  resetPalette(): void;
  /** Colour `from` of the frame palette shows what colour `to` shows now. */
  screenCol(from: number, to: number): void;
  /** The effect of every line that is not given one of its own. Holds until set again. */
  setFrameEffect(fx: DisplayEffect): void;
  /**
   * One line's own palette and effect, for the frame being drawn only: at the next `begin()` every
   * line follows the frame again. The palette is sixteen `#rrggbb` strings, colour 0 first.
   */
  setLinePalette(y: number, colours: readonly string[]): void;
  setLineEffect(y: number, fx: DisplayEffect): void;
  /** RGBA of the last presented frame, or null if unavailable. */
  screenshot(): Uint8ClampedArray | null;
  destroy(): void;
}

/** What a game may change about an instrument; a field left out keeps the document's value. */
export interface InstrumentPatch {
  osc?: Instrument['osc'];
  duty?: number;
  detune?: number;
  glide?: number;
  env?: Partial<Envelope>;
  vibrato?: Partial<Instrument['vibrato']>;
  arp?: Partial<Instrument['arp']>;
  filter?: Partial<Pick<Instrument['filter'], 'type' | 'cutoff' | 'resonance'>>;
  volume?: number;
  pan?: number;
}

export type PatternPatch = Partial<Pick<Pattern, 'bpm' | 'steps'>>;

export type SongPatch = Partial<Pick<Song, 'loop'>>;

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
  /** Holds the transport where it stands, and lets it go on from there. A stop resets it. */
  pause(): void;
  resume(): void;
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

/**
 * What the Lua `map` namespace reads. A map is named by its index in the order the game lists
 * them, counted from 0; the namespace itself counts from 1 and does the arithmetic.
 */
export interface GameData {
  mapCount(): number;
  /** A map's size, which a game may ask for and which is no longer the same for every map. */
  mapWidth(map: number): number;
  mapHeight(map: number): number;
  getFlag(index: number): number;
  getFlagBit(index: number, bit: number): boolean;
  getTile(x: number, y: number, map: number): number;
  /** Runtime-only tile override (not persisted). */
  setTile(x: number, y: number, sprite: number, map: number): void;
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
  /** Called with the names the game document gives its actions, when a run loads them. */
  onActionsDeclared?(actions: readonly DeclaredAction[]): void;
  log(level: ConsoleLevel, text: string): void;
}
