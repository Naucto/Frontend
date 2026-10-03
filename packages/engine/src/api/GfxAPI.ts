import { SCREEN_HEIGHT, SCREEN_WIDTH } from '../game/keys';
import { hexToRgb, rgbToHex } from '../gfx/glUtils';
import type { ApiContext } from './ApiContext';
import { EngineModule } from './EngineModule';
import { luaNumber } from './lua-args';
import { defineLuaNamespace, luaFn, type LuaParam, param } from './lua-namespace';
import { type DisplayEffect, NO_EFFECT } from './ports';

/** The first colour, which is what a sprite sheet's transparency channel is. */
const DEFAULT_KEY = 0;

/**
 * Which colour a draw keeps clear: left off the call, the sheet's transparency channel; passed as
 * nil, none at all.
 */
const transparent: LuaParam<number | null> = {
  name: 'transparent',
  type: 'number',
  optional: true,
  default: String(DEFAULT_KEY),
  read: (value, given) => {
    if (!given) {
      return DEFAULT_KEY;
    }
    return typeof value === 'number' && Number.isFinite(value) ? value & 15 : null;
  },
};

/** Always the lowercase `#rrggbb` form, so a colour reads back the same whichever scope holds it. */
const toHex = (red: unknown, green: number, blue: number): string =>
  typeof red === 'string'
    ? rgbToHex(...hexToRgb(red))
    : rgbToHex(Math.round(luaNumber(red)), Math.round(green), Math.round(blue));

/**
 * What one line shows, while the beam is on it: the palette and the effect the line-scoped calls
 * write, and whether the palette has left the frame's since the pass began. A line whose palette
 * is the frame's is not given one of its own.
 */
interface LineState {
  palette: string[];
  effect: DisplayEffect;
  touched: boolean;
}

export const GFX_API = defineLuaNamespace<GfxAPI>('gfx', {
  clear: luaFn(
    {
      summary: 'Fill the screen with a palette colour (default 0).',
      params: [param.number('colour', { default: 0 })],
      returns: null,
    },
    'clear',
  ),
  draw_sprite: luaFn(
    {
      summary: 'Draw w×h tiles starting at sprite n. Colour 0 is the transparent one by default.',
      params: [
        param.number('n'),
        param.number('x'),
        param.number('y'),
        param.number('w', { default: 1 }),
        param.number('h', { default: 1 }),
        param.bool('flip_h', { default: false }),
        param.bool('flip_v', { default: false }),
        param.number('scale', { default: 1 }),
        transparent,
      ],
      returns: null,
    },
    'drawSprite',
  ),
  draw_region: luaFn(
    {
      summary: 'Draw a pixel rectangle of the sprite sheet, optionally scaled.',
      params: [
        param.number('sx'),
        param.number('sy'),
        param.number('sw'),
        param.number('sh'),
        param.number('dx'),
        param.number('dy'),
        param.number('dw', { optional: true, defaultsTo: 'sw' }),
        param.number('dh', { optional: true, defaultsTo: 'sh' }),
        param.bool('flip_h', { default: false }),
        param.bool('flip_v', { default: false }),
        transparent,
      ],
      returns: null,
    },
    'drawRegion',
  ),
  pixel: luaFn(
    {
      summary: 'Set one screen pixel.',
      params: [param.number('x'), param.number('y'), param.number('colour')],
      returns: null,
    },
    'pixel',
  ),
  get_pixel: luaFn(
    {
      summary: 'Read the palette index at a screen pixel (slow).',
      params: [param.number('x'), param.number('y')],
      returns: 'number',
    },
    'getPixel',
  ),
  line: luaFn(
    {
      summary: 'Draw a one-pixel line.',
      params: [
        param.number('x0'),
        param.number('y0'),
        param.number('x1'),
        param.number('y1'),
        param.number('colour'),
      ],
      returns: null,
    },
    'line',
  ),
  rect: luaFn(
    {
      summary: 'Draw a rectangle outline.',
      params: [
        param.number('x'),
        param.number('y'),
        param.number('w'),
        param.number('h'),
        param.number('colour'),
      ],
      returns: null,
    },
    'rect',
  ),
  fill_rect: luaFn(
    {
      summary: 'Draw a filled rectangle.',
      params: [
        param.number('x'),
        param.number('y'),
        param.number('w'),
        param.number('h'),
        param.number('colour'),
      ],
      returns: null,
    },
    'fillRect',
  ),
  circle: luaFn(
    {
      summary: 'Draw a circle outline.',
      params: [param.number('cx'), param.number('cy'), param.number('r'), param.number('colour')],
      returns: null,
    },
    'circle',
  ),
  fill_circle: luaFn(
    {
      summary: 'Draw a filled circle.',
      params: [param.number('cx'), param.number('cy'), param.number('r'), param.number('colour')],
      returns: null,
    },
    'fillCircle',
  ),
  print: luaFn(
    {
      summary: 'Draw text with the built-in 4×6 font; returns its width.',
      params: [
        param.string('text'),
        param.number('x'),
        param.number('y'),
        param.number('colour', { default: 5 }),
      ],
      returns: 'number',
    },
    'print',
  ),
  camera: luaFn(
    {
      summary: 'Offset every later draw call; no arguments resets.',
      params: [param.number('x', { default: 0 }), param.number('y', { default: 0 })],
      returns: null,
    },
    'camera',
  ),
  clip: luaFn(
    {
      summary: 'Restrict drawing to a rectangle; no arguments resets.',
      params: [
        param.number('x', { optional: true }),
        param.number('y', { default: 0 }),
        param.number('w', { default: 0 }),
        param.number('h', { default: 0 }),
      ],
      returns: null,
    },
    'clip',
  ),
  set_col: luaFn(
    {
      summary: 'Draw palette remap: pixels of colour `from` are drawn as `to`.',
      params: [param.number('from'), param.number('to')],
      returns: null,
    },
    'setCol',
  ),
  reset_col: luaFn(
    { summary: 'Clear the draw palette remap.', params: [], returns: null },
    'resetCol',
  ),
  set_color: luaFn(
    {
      summary: 'Change a screen colour: for the frame, or from this line on inside `_scanline`.',
      params: [
        param.number('index'),
        param.any('hex', { type: 'string|number', signature: 'hex | r' }),
        param.number('g', { default: 0 }),
        param.number('b', { default: 0 }),
      ],
      returns: null,
    },
    'setColor',
  ),
  get_color: luaFn(
    {
      summary: 'Current screen colour as "#rrggbb", of the frame or of the line being scanned.',
      params: [param.number('index')],
      returns: 'string',
    },
    'getColor',
  ),
  reset_palette: luaFn(
    {
      summary:
        'Restore the game palette; inside `_scanline`, put the line back to the frame palette.',
      params: [],
      returns: null,
    },
    'resetPalette',
  ),
  screen_col: luaFn(
    {
      summary: 'Screen palette remap applied at display time, for the frame or from this line on.',
      params: [param.number('from'), param.number('to')],
      returns: null,
    },
    'screenCol',
  ),
  shift: luaFn(
    {
      summary:
        'Shift the display by whole pixels: the frame from anywhere but `_scanline`, this line on from inside it.',
      params: [
        param.number('dx'),
        param.number('dy', { default: 0 }),
        param.bool('wrap', { default: false }),
      ],
      returns: null,
    },
    'shift',
  ),
  blank: luaFn(
    {
      summary:
        'Show black instead: the whole frame from anywhere but `_scanline`, this line on from inside it.',
      params: [param.bool('on', { default: true })],
      returns: null,
    },
    'blank',
  ),
  width: luaFn(
    { summary: `Screen width (${String(SCREEN_WIDTH)}).`, params: [], returns: 'number' },
    'width',
  ),
  height: luaFn(
    { summary: `Screen height (${String(SCREEN_HEIGHT)}).`, params: [], returns: 'number' },
    'height',
  ),
});

/**
 * The `gfx` namespace.
 *
 * The palette and shift calls have two scopes, told apart by when they are called. Outside the beam
 * pass they set the frame: what the whole display shows, kept from frame to frame the way `camera`
 * is. Inside `_scanline(y)` they set the line: a state copied from the frame when the pass begins,
 * carried from one line to the next, and forgotten when the pass ends.
 */
export class GfxAPI extends EngineModule {
  private frameEffect: DisplayEffect = NO_EFFECT;
  /** Set while `_scanline` runs; the calls read it to know which scope they write. */
  private beamLine: LineState | null = null;

  constructor(ctx: ApiContext) {
    super(ctx);
    ctx.lua.registerNamespace(GFX_API, this);
  }

  clear(colour: number): void {
    this.ctx.gfx.clear(colour);
  }

  drawSprite(
    sprite: number,
    x: number,
    y: number,
    width: number,
    height: number,
    flipH: boolean,
    flipV: boolean,
    scale: number,
    key: number | null,
  ): void {
    this.ctx.gfx.drawSprite(sprite, x, y, width, height, flipH, flipV, scale, key);
  }

  drawRegion(
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    dw: number | undefined,
    dh: number | undefined,
    flipH: boolean,
    flipV: boolean,
    key: number | null,
  ): void {
    this.ctx.gfx.drawRegion(sx, sy, sw, sh, dx, dy, dw ?? sw, dh ?? sh, flipH, flipV, key);
  }

  pixel(x: number, y: number, colour: number): void {
    this.ctx.gfx.pixel(x, y, colour);
  }

  getPixel(x: number, y: number): number {
    return this.ctx.gfx.getPixel(x, y);
  }

  line(x0: number, y0: number, x1: number, y1: number, colour: number): void {
    this.ctx.gfx.line(x0, y0, x1, y1, colour);
  }

  rect(x: number, y: number, width: number, height: number, colour: number): void {
    this.ctx.gfx.rect(x, y, width, height, colour);
  }

  fillRect(x: number, y: number, width: number, height: number, colour: number): void {
    this.ctx.gfx.fillRect(x, y, width, height, colour);
  }

  circle(cx: number, cy: number, radius: number, colour: number): void {
    this.ctx.gfx.circle(cx, cy, radius, colour);
  }

  fillCircle(cx: number, cy: number, radius: number, colour: number): void {
    this.ctx.gfx.fillCircle(cx, cy, radius, colour);
  }

  /** The width of what it drew, in pixels. */
  print(text: string, x: number, y: number, colour: number): number {
    return this.ctx.gfx.print(text, x, y, colour);
  }

  camera(x: number, y: number): void {
    this.ctx.gfx.camera(x, y);
  }

  /** Without an `x`, drawing reaches the whole screen again. */
  clip(x: number | undefined, y: number, width: number, height: number): void {
    if (x === undefined) {
      this.ctx.gfx.resetClip();
    } else {
      this.ctx.gfx.clip(x, y, width, height);
    }
  }

  setCol(from: number, to: number): void {
    this.ctx.gfx.setCol(from, to);
  }

  resetCol(): void {
    this.ctx.gfx.resetCol();
  }

  /** `hexOrRed` is a `#rrggbb` string, or the red of the three numbers. */
  setColor(index: number, hexOrRed: unknown, green: number, blue: number): void {
    const hex = toHex(hexOrRed, green, blue);
    if (this.beamLine) {
      this.beamLine.palette[index & 15] = hex;
      this.beamLine.touched = true;
    } else {
      this.ctx.gfx.setColour(index, hex);
    }
  }

  getColor(index: number): string {
    return this.beamLine
      ? (this.beamLine.palette[index & 15] ?? '#000000')
      : this.ctx.gfx.getColour(index);
  }

  resetPalette(): void {
    if (this.beamLine) {
      for (let i = 0; i < 16; i++) {
        this.beamLine.palette[i] = this.ctx.gfx.getColour(i);
      }
      this.beamLine.touched = false;
    } else {
      this.ctx.gfx.resetPalette();
    }
  }

  screenCol(from: number, to: number): void {
    if (this.beamLine) {
      this.beamLine.palette[from & 15] = this.beamLine.palette[to & 15] ?? '#000000';
      this.beamLine.touched = true;
    } else {
      this.ctx.gfx.screenCol(from, to);
    }
  }

  private get effect(): DisplayEffect {
    return this.beamLine ? this.beamLine.effect : this.frameEffect;
  }

  private setEffect(fx: DisplayEffect): void {
    if (this.beamLine) {
      this.beamLine.effect = fx;
    } else {
      this.frameEffect = fx;
      this.ctx.gfx.setFrameEffect(fx);
    }
  }

  shift(dx: number, dy: number, wrap: boolean): void {
    this.setEffect({ shiftX: dx, shiftY: dy, wrap, blank: this.effect.blank });
  }

  blank(on: boolean): void {
    this.setEffect({ ...this.effect, blank: on });
  }

  width(): number {
    return SCREEN_WIDTH;
  }

  height(): number {
    return SCREEN_HEIGHT;
  }

  /**
   * The beam pass: `scanline(y)` for every line of the frame just drawn, top to bottom, each line
   * then recorded as the line state leaves it. What a call changes on one line holds for the lines
   * after it; the next pass starts from the frame again.
   *
   * The line palette starts as a copy of the frame's, read back from the renderer rather than kept
   * here, so that a `set_color` in `_draw` and a document palette edit are both seen.
   */
  beam(scanline: (y: number) => unknown): void {
    const gfx = this.ctx.gfx;
    const line: LineState = {
      palette: Array.from({ length: 16 }, (_, i) => gfx.getColour(i)),
      effect: this.frameEffect,
      touched: false,
    };
    this.beamLine = line;
    try {
      for (let y = 0; y < SCREEN_HEIGHT; y++) {
        scanline(y);
        if (line.touched) {
          gfx.setLinePalette(y, line.palette.slice());
        }
        gfx.setLineEffect(y, line.effect);
      }
    } finally {
      this.beamLine = null;
    }
  }

  /**
   * Hands the screen back the way the document describes it: palette, remap, clip, camera and frame
   * effect live in the renderer, not in the Lua state, so they outlive the VM unless reset here.
   * The frame already presented is not repainted.
   */
  override destroy(): void {
    const gfx = this.ctx.gfx;
    this.beamLine = null;
    this.frameEffect = NO_EFFECT;
    gfx.setFrameEffect(NO_EFFECT);
    gfx.resetPalette();
    gfx.resetCol();
    gfx.resetClip();
    gfx.camera(0, 0);
  }
}
