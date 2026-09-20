import { hexToRgb, rgbToHex } from '../gfx/glUtils';
import type { ApiContext } from './ApiContext';
import { EngineModule } from './EngineModule';
import { type DisplayEffect, NO_EFFECT } from './ports';

const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const bool = (v: unknown, d = false): boolean =>
  typeof v === 'boolean' ? v : v === undefined ? d : Boolean(v);

/** The first colour, which is what a sprite sheet's transparency channel is. */
const DEFAULT_KEY = 0;

/**
 * Which colour a draw keeps clear, read from the arguments as Lua pushed them.
 *
 * "The usual" and "none" are different answers, and inside a Lua function they could not be: an
 * absent argument and an explicit nil both read as nil. They differ here only because the binding
 * takes what was pushed rather than a fixed arity — omitted is absent from the list, nil is
 * present and undefined — so this must keep reading the list, not a parameter.
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
    : rgbToHex(Math.round(num(r)), Math.round(num(g)), Math.round(num(b)));

/** The screen height, which is how many times the beam calls `_scanline` per frame. */
const LINES = 180;

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
        g.clear(num(c));
      },
      draw_sprite: (...a: unknown[]) => {
        g.drawSprite(
          num(a[0]),
          num(a[1]),
          num(a[2]),
          num(a[3], 1),
          num(a[4], 1),
          bool(a[5]),
          bool(a[6]),
          num(a[7], 1),
          keyColour(a, 8),
        );
      },
      draw_region: (...a: unknown[]) => {
        g.drawRegion(
          num(a[0]),
          num(a[1]),
          num(a[2]),
          num(a[3]),
          num(a[4]),
          num(a[5]),
          num(a[6], num(a[2])),
          num(a[7], num(a[3])),
          bool(a[8]),
          bool(a[9]),
          keyColour(a, 10),
        );
      },
      pixel: (x: unknown, y: unknown, c: unknown) => {
        g.pixel(num(x), num(y), num(c));
      },
      get_pixel: (x: unknown, y: unknown) => g.getPixel(num(x), num(y)),
      line: (x0: unknown, y0: unknown, x1: unknown, y1: unknown, c: unknown) => {
        g.line(num(x0), num(y0), num(x1), num(y1), num(c));
      },
      rect: (x: unknown, y: unknown, w: unknown, h: unknown, c: unknown) => {
        g.rect(num(x), num(y), num(w), num(h), num(c));
      },
      fill_rect: (x: unknown, y: unknown, w: unknown, h: unknown, c: unknown) => {
        g.fillRect(num(x), num(y), num(w), num(h), num(c));
      },
      circle: (cx: unknown, cy: unknown, r: unknown, c: unknown) => {
        g.circle(num(cx), num(cy), num(r), num(c));
      },
      fill_circle: (cx: unknown, cy: unknown, r: unknown, c: unknown) => {
        g.fillCircle(num(cx), num(cy), num(r), num(c));
      },
      print: (t: unknown, x: unknown, y: unknown, c?: unknown) =>
        g.print(
          typeof t === 'string' ? t : typeof t === 'number' ? String(t) : '',
          num(x),
          num(y),
          num(c, 5),
        ),
      camera: (x?: unknown, y?: unknown) => {
        g.camera(num(x), num(y));
      },
      clip: (x?: unknown, y?: unknown, w?: unknown, h?: unknown) => {
        if (x === undefined) g.resetClip();
        else g.clip(num(x), num(y), num(w), num(h));
      },
      set_col: (a: unknown, b: unknown) => {
        g.setCol(num(a), num(b));
      },
      reset_col: () => {
        g.resetCol();
      },
      set_color: (i: unknown, r: unknown, gg?: unknown, b?: unknown) => {
        const hex = toHex(r, gg, b);
        if (this.line) {
          this.line.palette[num(i) & 15] = hex;
          this.line.touched = true;
        } else g.setColour(num(i), hex);
      },
      get_color: (i: unknown) =>
        this.line ? (this.line.palette[num(i) & 15] ?? '#000000') : g.getColour(num(i)),
      reset_palette: () => {
        if (this.line) {
          for (let i = 0; i < 16; i++) this.line.palette[i] = g.getColour(i);
          this.line.touched = false;
        } else g.resetPalette();
      },
      screen_col: (a: unknown, b: unknown) => {
        if (this.line) {
          this.line.palette[num(a) & 15] = this.line.palette[num(b) & 15] ?? '#000000';
          this.line.touched = true;
        } else g.screenCol(num(a), num(b));
      },
      shift: (dx: unknown, dy?: unknown, wrap?: unknown) => {
        this.setEffect({
          shiftX: num(dx),
          shiftY: num(dy),
          wrap: bool(wrap),
          blank: this.effect.blank,
        });
      },
      blank: (on?: unknown) => {
        this.setEffect({ ...this.effect, blank: bool(on, true) });
      },
      width: () => 320,
      height: () => 180,
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
   * Hand the screen back the way the document describes it.
   *
   * None of this lives in the Lua state, so none of it died with the VM: a game that faded out by
   * rewriting the frame palette, or shifted the frame and then crashed, was handing the next run a
   * black screen or an offset one. The last presented frame is not repainted — those pixels are
   * already out, and the palette is only read at present time.
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
