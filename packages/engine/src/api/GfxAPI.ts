import type { ApiContext } from './ApiContext';
import { EngineModule } from './EngineModule';
import type { ScanlineEffect } from './ports';

const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const bool = (v: unknown, d = false): boolean =>
  typeof v === 'boolean' ? v : v === undefined ? d : Boolean(v);

const toEffect = (opts: unknown): ScanlineEffect => {
  if (typeof opts !== 'object' || opts === null) return {};
  const o = opts as Record<string, unknown>;
  const fx: ScanlineEffect = {};
  if (o.shift_x !== undefined) fx.shiftX = num(o.shift_x);
  if (o.shift_y !== undefined) fx.shiftY = num(o.shift_y);
  if (o.palette !== undefined) fx.palette = num(o.palette);
  if (o.wrap !== undefined) fx.wrap = bool(o.wrap);
  if (o.blank !== undefined) fx.blank = bool(o.blank);
  return fx;
};

const toHex = (r: unknown, g: unknown, b: unknown): string => {
  if (typeof r === 'string') return r;
  const c = (v: unknown): string =>
    Math.max(0, Math.min(255, Math.round(num(v))))
      .toString(16)
      .padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
};

/** The `gfx` namespace. */
export class GfxAPI extends EngineModule {
  constructor(ctx: ApiContext) {
    super(ctx);
    const g = ctx.gfx;
    ctx.lua.setGlobalWith('gfx', {
      clear: (c?: unknown) => {
        g.clear(num(c));
      },
      draw_sprite: (
        n: unknown,
        x: unknown,
        y: unknown,
        w?: unknown,
        h?: unknown,
        fh?: unknown,
        fv?: unknown,
        s?: unknown,
      ) => {
        g.drawSprite(num(n), num(x), num(y), num(w, 1), num(h, 1), bool(fh), bool(fv), num(s, 1));
      },
      draw_region: (
        sx: unknown,
        sy: unknown,
        sw: unknown,
        sh: unknown,
        dx: unknown,
        dy: unknown,
        dw?: unknown,
        dh?: unknown,
        fh?: unknown,
        fv?: unknown,
      ) => {
        g.drawRegion(
          num(sx),
          num(sy),
          num(sw),
          num(sh),
          num(dx),
          num(dy),
          num(dw, num(sw)),
          num(dh, num(sh)),
          bool(fh),
          bool(fv),
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
      set_transparent: (i: unknown, on?: unknown) => {
        g.setTransparent(num(i), bool(on, true));
      },
      set_color: (i: unknown, r: unknown, gg?: unknown, b?: unknown) => {
        g.setColour(num(i), toHex(r, gg, b));
      },
      get_color: (i: unknown) => g.getColour(num(i)),
      reset_palette: () => {
        g.resetPalette();
      },
      set_palette_row: (row: unknown, colours: unknown) => {
        const list = Array.isArray(colours)
          ? colours
          : typeof colours === 'object' && colours !== null
            ? Object.values(colours)
            : [];
        g.setPaletteRow(
          num(row),
          list.map((c) => String(c)),
        );
      },
      screen_col: (a: unknown, b: unknown, row?: unknown) => {
        g.screenCol(num(a), num(b), num(row));
      },
      scanline: (y: unknown, opts: unknown) => {
        g.scanline(num(y), toEffect(opts));
      },
      scanline_range: (y0: unknown, y1: unknown, opts: unknown) => {
        const fx = toEffect(opts);
        for (let y = num(y0); y <= num(y1); y++) g.scanline(y, fx);
      },
      scanline_fn: (fn: unknown) => {
        if (typeof fn !== 'function') return;
        for (let y = 0; y < 180; y++) {
          const res = (fn as (y: number) => unknown)(y);
          const first: unknown = Array.isArray(res) ? (res as unknown[])[0] : res;
          if (first) g.scanline(y, toEffect(first));
        }
      },
      reset_scanlines: () => {
        g.resetScanlines();
      },
      persist_effects: (on: unknown) => {
        g.persistEffects(bool(on, true));
      },
      width: () => 320,
      height: () => 180,
    });
  }
}
