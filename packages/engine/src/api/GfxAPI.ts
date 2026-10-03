import { hexToRgb, rgbToHex } from '../gfx/glUtils';
import type { ApiContext } from './ApiContext';
import { EngineModule } from './EngineModule';
import { luaNumber } from './lua-args';
import { type DisplayEffect, NO_EFFECT } from './ports';

const bool = (v: unknown, d = false): boolean =>
  typeof v === 'boolean' ? v : v === undefined ? d : Boolean(v);

/** The first colour, which is what a sprite sheet's transparency channel is. */
const DEFAULT_KEY = 0;

/**
 * Which colour a draw keeps clear, read from the arguments as Lua pushed them: an omitted argument
 * and an explicit nil both read as nil through a fixed arity, and only the pushed list tells the
 * two apart.
 */
const keyColour = (args: readonly unknown[], at: number): number | null => {
  if (args.length <= at) return DEFAULT_KEY;
  const v = args[at];
  return typeof v === 'number' && Number.isFinite(v) ? v & 15 : null;
};

/** Always the lowercase `#rrggbb` form, so a colour reads back the same whichever scope holds it. */
const toHex = (r: unknown, g: unknown, b: unknown): string =>
  typeof r === 'string'
    ? rgbToHex(...hexToRgb(r))
    : rgbToHex(Math.round(luaNumber(r)), Math.round(luaNumber(g)), Math.round(luaNumber(b)));

/** The screen height, which is how many times the beam calls `_scanline` per frame. */
const LINES = 180;
/** The screen width, in pixels. */
const COLS = 320;

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
  private line: LineState | null = null;

  constructor(ctx: ApiContext) {
    super(ctx);
    const g = ctx.gfx;
    ctx.lua.setGlobalWith('gfx', {
      clear: (c?: unknown) => {
        g.clear(luaNumber(c));
      },
      draw_sprite: (...a: unknown[]) => {
        g.drawSprite(
          luaNumber(a[0]),
          luaNumber(a[1]),
          luaNumber(a[2]),
          luaNumber(a[3], 1),
          luaNumber(a[4], 1),
          bool(a[5]),
          bool(a[6]),
          luaNumber(a[7], 1),
          keyColour(a, 8),
        );
      },
      draw_region: (...a: unknown[]) => {
        g.drawRegion(
          luaNumber(a[0]),
          luaNumber(a[1]),
          luaNumber(a[2]),
          luaNumber(a[3]),
          luaNumber(a[4]),
          luaNumber(a[5]),
          luaNumber(a[6], luaNumber(a[2])),
          luaNumber(a[7], luaNumber(a[3])),
          bool(a[8]),
          bool(a[9]),
          keyColour(a, 10),
        );
      },
      pixel: (x: unknown, y: unknown, c: unknown) => {
        g.pixel(luaNumber(x), luaNumber(y), luaNumber(c));
      },
      get_pixel: (x: unknown, y: unknown) => g.getPixel(luaNumber(x), luaNumber(y)),
      line: (x0: unknown, y0: unknown, x1: unknown, y1: unknown, c: unknown) => {
        g.line(luaNumber(x0), luaNumber(y0), luaNumber(x1), luaNumber(y1), luaNumber(c));
      },
      rect: (x: unknown, y: unknown, w: unknown, h: unknown, c: unknown) => {
        g.rect(luaNumber(x), luaNumber(y), luaNumber(w), luaNumber(h), luaNumber(c));
      },
      fill_rect: (x: unknown, y: unknown, w: unknown, h: unknown, c: unknown) => {
        g.fillRect(luaNumber(x), luaNumber(y), luaNumber(w), luaNumber(h), luaNumber(c));
      },
      circle: (cx: unknown, cy: unknown, r: unknown, c: unknown) => {
        g.circle(luaNumber(cx), luaNumber(cy), luaNumber(r), luaNumber(c));
      },
      fill_circle: (cx: unknown, cy: unknown, r: unknown, c: unknown) => {
        g.fillCircle(luaNumber(cx), luaNumber(cy), luaNumber(r), luaNumber(c));
      },
      print: (t: unknown, x: unknown, y: unknown, c?: unknown) =>
        g.print(
          typeof t === 'string' ? t : typeof t === 'number' ? String(t) : '',
          luaNumber(x),
          luaNumber(y),
          luaNumber(c, 5),
        ),
      camera: (x?: unknown, y?: unknown) => {
        g.camera(luaNumber(x), luaNumber(y));
      },
      clip: (x?: unknown, y?: unknown, w?: unknown, h?: unknown) => {
        if (x === undefined) g.resetClip();
        else g.clip(luaNumber(x), luaNumber(y), luaNumber(w), luaNumber(h));
      },
      set_col: (a: unknown, b: unknown) => {
        g.setCol(luaNumber(a), luaNumber(b));
      },
      reset_col: () => {
        g.resetCol();
      },
      set_color: (i: unknown, r: unknown, gg?: unknown, b?: unknown) => {
        const hex = toHex(r, gg, b);
        if (this.line) {
          this.line.palette[luaNumber(i) & 15] = hex;
          this.line.touched = true;
        } else g.setColour(luaNumber(i), hex);
      },
      get_color: (i: unknown) =>
        this.line ? (this.line.palette[luaNumber(i) & 15] ?? '#000000') : g.getColour(luaNumber(i)),
      reset_palette: () => {
        if (this.line) {
          for (let i = 0; i < 16; i++) this.line.palette[i] = g.getColour(i);
          this.line.touched = false;
        } else g.resetPalette();
      },
      screen_col: (a: unknown, b: unknown) => {
        if (this.line) {
          this.line.palette[luaNumber(a) & 15] = this.line.palette[luaNumber(b) & 15] ?? '#000000';
          this.line.touched = true;
        } else g.screenCol(luaNumber(a), luaNumber(b));
      },
      shift: (dx: unknown, dy?: unknown, wrap?: unknown) => {
        this.setEffect({
          shiftX: luaNumber(dx),
          shiftY: luaNumber(dy),
          wrap: bool(wrap),
          blank: this.effect.blank,
        });
      },
      blank: (on?: unknown) => {
        this.setEffect({ ...this.effect, blank: bool(on, true) });
      },
      width: () => COLS,
      height: () => LINES,
    });
  }

  private get effect(): DisplayEffect {
    return this.line ? this.line.effect : this.frameEffect;
  }

  private setEffect(fx: DisplayEffect): void {
    if (this.line) this.line.effect = fx;
    else {
      this.frameEffect = fx;
      this.ctx.gfx.setFrameEffect(fx);
    }
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
    const g = this.ctx.gfx;
    const line: LineState = {
      palette: Array.from({ length: 16 }, (_, i) => g.getColour(i)),
      effect: this.frameEffect,
      touched: false,
    };
    this.line = line;
    try {
      for (let y = 0; y < LINES; y++) {
        scanline(y);
        if (line.touched) g.setLinePalette(y, line.palette.slice());
        g.setLineEffect(y, line.effect);
      }
    } finally {
      this.line = null;
    }
  }

  /**
   * Hands the screen back the way the document describes it: palette, remap, clip, camera and frame
   * effect live in the renderer, not in the Lua state, so they outlive the VM unless reset here.
   * The frame already presented is not repainted.
   */
  override destroy(): void {
    const g = this.ctx.gfx;
    this.line = null;
    this.frameEffect = NO_EFFECT;
    g.setFrameEffect(NO_EFFECT);
    g.resetPalette();
    g.resetCol();
    g.resetClip();
    g.camera(0, 0);
  }
}
