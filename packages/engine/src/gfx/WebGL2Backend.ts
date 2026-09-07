import type { GfxBackend, ScanlineEffect } from '../api/ports';
import type { Game } from '../game/Game';
import {
  MAP_HEIGHT,
  MAP_WIDTH,
  PALETTE_SIZE,
  SCREEN_HEIGHT,
  SCREEN_WIDTH,
  SHEET_HEIGHT,
  SHEET_WIDTH,
  SPRITE_SIZE,
  SPRITES_PER_ROW,
} from '../game/keys';
import { buildFontAtlas, FONT_HEIGHT, FONT_WIDTH, glyphIndex } from './Font';
import { createGLContext, createTexture, hexToRgb, linkProgram, rgbToHex } from './glUtils';
import { DRAW_FS, DRAW_VS, PRESENT_FS, PRESENT_VS } from './shaders';

const UNIT_SHEET = 0;
const UNIT_MAP = 1;
const UNIT_FONT = 2;
const UNIT_FRAME = 3;
const UNIT_EFFECTS = 4;
const UNIT_PALETTES = 5;

const MAP_PX_W = MAP_WIDTH * SPRITE_SIZE;
const MAP_PX_H = MAP_HEIGHT * SPRITE_SIZE;
const FX_WRAP = 1;
const FX_BLANK = 2;

type BatchSource = 'sheet' | 'map' | 'font' | 'solid';

/**
 * GPU renderer. Pass 1 batches textured/solid quads into an R8 index frame;
 * pass 2 presents it through the scanline effect table and the screen palette.
 */
export class WebGL2Backend implements GfxBackend {
  private readonly gl: WebGL2RenderingContext;
  private readonly drawProgram: WebGLProgram;
  private readonly presentProgram: WebGLProgram;
  private readonly fbo: WebGLFramebuffer;
  private readonly textures: WebGLTexture[] = [];
  private readonly vao: WebGLVertexArrayObject;
  private readonly posBuffer: WebGLBuffer;
  private readonly uvBuffer: WebGLBuffer;
  private readonly uCamera: WebGLUniformLocation | null;
  private readonly uRemap: WebGLUniformLocation | null;
  private readonly uTransparent: WebGLUniformLocation | null;
  private readonly uSolid: WebGLUniformLocation | null;
  private readonly uSrc: WebGLUniformLocation | null;

  private verts: number[] = [];
  private uvs: number[] = [];
  private batchSource: BatchSource = 'sheet';
  private batchSolid = -1;
  private batchTextColour = -1;

  private cameraX = 0;
  private cameraY = 0;
  private clipRect: [number, number, number, number] | null = null;
  private readonly remap = new Int32Array(16);
  private transparentMask = 1;
  private remapDirty = true;

  private readonly effects = new Int16Array(SCREEN_HEIGHT * 4);
  private effectsDirty = true;
  private effectsUsed = false;
  private persist = false;
  private readonly palettes = new Uint8Array(PALETTE_SIZE * PALETTE_SIZE * 4);
  private palettesDirty = true;
  private gamePalette: string[];

  private mapDirty = true;
  private readonly mapPixels = new Uint8Array(MAP_PX_W * MAP_PX_H);
  private readonly unsubscribes: (() => void)[] = [];
  private destroyed = false;

  constructor(
    canvas: HTMLCanvasElement,
    private readonly game: Game,
  ) {
    canvas.width = SCREEN_WIDTH;
    canvas.height = SCREEN_HEIGHT;
    const gl = createGLContext(canvas);
    this.gl = gl;
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

    this.drawProgram = linkProgram(gl, DRAW_VS, DRAW_FS);
    this.presentProgram = linkProgram(gl, PRESENT_VS, PRESENT_FS);

    // sheet
    this.textures[UNIT_SHEET] = createTexture(gl, UNIT_SHEET);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.R8,
      SHEET_WIDTH,
      SHEET_HEIGHT,
      0,
      gl.RED,
      gl.UNSIGNED_BYTE,
      game.sheet,
    );
    // map (built lazily)
    this.textures[UNIT_MAP] = createTexture(gl, UNIT_MAP);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, MAP_PX_W, MAP_PX_H, 0, gl.RED, gl.UNSIGNED_BYTE, null);
    // font
    const font = buildFontAtlas();
    this.textures[UNIT_FONT] = createTexture(gl, UNIT_FONT);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.R8,
      font.width,
      font.height,
      0,
      gl.RED,
      gl.UNSIGNED_BYTE,
      font.data,
    );
    // frame target
    this.textures[UNIT_FRAME] = createTexture(gl, UNIT_FRAME);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.R8,
      SCREEN_WIDTH,
      SCREEN_HEIGHT,
      0,
      gl.RED,
      gl.UNSIGNED_BYTE,
      null,
    );
    this.fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      this.textures[UNIT_FRAME],
      0,
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    // effects
    this.textures[UNIT_EFFECTS] = createTexture(gl, UNIT_EFFECTS);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA16I,
      SCREEN_HEIGHT,
      1,
      0,
      gl.RGBA_INTEGER,
      gl.SHORT,
      this.effects,
    );
    // palettes
    this.textures[UNIT_PALETTES] = createTexture(gl, UNIT_PALETTES);
    this.gamePalette = game.palette;
    this.resetPalette();
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      PALETTE_SIZE,
      PALETTE_SIZE,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      this.palettes,
    );

    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    this.posBuffer = gl.createBuffer();
    this.uvBuffer = gl.createBuffer();
    const aPos = gl.getAttribLocation(this.drawProgram, 'a_pos');
    const aUv = gl.getAttribLocation(this.drawProgram, 'a_uv');
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuffer);
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuffer);
    gl.enableVertexAttribArray(aUv);
    gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    gl.useProgram(this.drawProgram);
    gl.uniform2f(gl.getUniformLocation(this.drawProgram, 'u_screen'), SCREEN_WIDTH, SCREEN_HEIGHT);
    this.uCamera = gl.getUniformLocation(this.drawProgram, 'u_camera');
    this.uRemap = gl.getUniformLocation(this.drawProgram, 'u_remap');
    this.uTransparent = gl.getUniformLocation(this.drawProgram, 'u_transparent');
    this.uSolid = gl.getUniformLocation(this.drawProgram, 'u_solid');
    this.uSrc = gl.getUniformLocation(this.drawProgram, 'u_src');
    gl.useProgram(this.presentProgram);
    gl.uniform1i(gl.getUniformLocation(this.presentProgram, 'u_frame'), UNIT_FRAME);
    gl.uniform1i(gl.getUniformLocation(this.presentProgram, 'u_effects'), UNIT_EFFECTS);
    gl.uniform1i(gl.getUniformLocation(this.presentProgram, 'u_palettes'), UNIT_PALETTES);

    this.resetCol();

    this.unsubscribes.push(
      game.onPixelsChange((changes) => {
        this.uploadSheetRegion(changes);
        this.mapDirty = true;
      }),
      game.onTilesChange(() => {
        this.mapDirty = true;
      }),
      game.onPaletteChange(() => {
        this.gamePalette = game.palette;
        this.resetPalette();
      }),
    );
    this.clear(0);
    this.present();
  }

  // ---- frame ----------------------------------------------------------------

  begin(): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
    gl.useProgram(this.drawProgram);
    gl.bindVertexArray(this.vao);
    this.applyClip();
  }

  present(): void {
    const gl = this.gl;
    this.flush();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.disable(gl.SCISSOR_TEST);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.useProgram(this.presentProgram);
    if (this.effectsDirty) {
      gl.activeTexture(gl.TEXTURE0 + UNIT_EFFECTS);
      gl.bindTexture(gl.TEXTURE_2D, this.tex(UNIT_EFFECTS));
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        0,
        SCREEN_HEIGHT,
        1,
        gl.RGBA_INTEGER,
        gl.SHORT,
        this.effects,
      );
      this.effectsDirty = false;
    }
    if (this.palettesDirty) {
      gl.activeTexture(gl.TEXTURE0 + UNIT_PALETTES);
      gl.bindTexture(gl.TEXTURE_2D, this.tex(UNIT_PALETTES));
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        0,
        PALETTE_SIZE,
        PALETTE_SIZE,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        this.palettes,
      );
      this.palettesDirty = false;
    }
    gl.bindVertexArray(null);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (!this.persist && this.effectsUsed) this.resetScanlines();
  }

  clear(colour: number): void {
    this.flush();
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.disable(gl.SCISSOR_TEST);
    gl.viewport(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
    gl.clearColor((colour & 15) / 255, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.applyClip();
  }

  camera(x: number, y: number): void {
    if (x === this.cameraX && y === this.cameraY) return;
    this.flush();
    this.cameraX = Math.floor(x);
    this.cameraY = Math.floor(y);
    this.gl.useProgram(this.drawProgram);
    this.gl.uniform2f(this.uCamera, this.cameraX, this.cameraY);
  }

  clip(x: number, y: number, w: number, h: number): void {
    this.flush();
    this.clipRect = [
      Math.floor(x),
      Math.floor(y),
      Math.max(0, Math.floor(w)),
      Math.max(0, Math.floor(h)),
    ];
    this.applyClip();
  }

  resetClip(): void {
    this.flush();
    this.clipRect = null;
    this.applyClip();
  }

  // ---- drawing --------------------------------------------------------------

  drawSprite(
    n: number,
    x: number,
    y: number,
    w: number,
    h: number,
    flipH: boolean,
    flipV: boolean,
    scale: number,
  ): void {
    n = Math.floor(n);
    const sx = (n % SPRITES_PER_ROW) * SPRITE_SIZE;
    const sy = Math.floor(n / SPRITES_PER_ROW) * SPRITE_SIZE;
    const sw = Math.floor(w) * SPRITE_SIZE;
    const sh = Math.floor(h) * SPRITE_SIZE;
    this.drawRegion(sx, sy, sw, sh, x, y, sw * scale, sh * scale, flipH, flipV);
  }

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
  ): void {
    this.useBatch('sheet', -1, -1);
    let u0 = sx / SHEET_WIDTH;
    let v0 = sy / SHEET_HEIGHT;
    let u1 = (sx + sw) / SHEET_WIDTH;
    let v1 = (sy + sh) / SHEET_HEIGHT;
    if (flipH) [u0, u1] = [u1, u0];
    if (flipV) [v0, v1] = [v1, v0];
    this.pushQuad(Math.floor(dx), Math.floor(dy), Math.floor(dw), Math.floor(dh), u0, v0, u1, v1);
  }

  drawMap(x: number, y: number, tx: number, ty: number, tw: number, th: number): void {
    if (this.mapDirty) this.rebuildMap();
    this.useBatch('map', -1, -1);
    const px = tx * SPRITE_SIZE;
    const py = ty * SPRITE_SIZE;
    const pw = tw * SPRITE_SIZE;
    const ph = th * SPRITE_SIZE;
    this.pushQuad(
      Math.floor(x),
      Math.floor(y),
      pw,
      ph,
      px / MAP_PX_W,
      py / MAP_PX_H,
      (px + pw) / MAP_PX_W,
      (py + ph) / MAP_PX_H,
    );
  }

  pixel(x: number, y: number, colour: number): void {
    this.useBatch('solid', colour & 15, -1);
    this.pushQuad(Math.floor(x), Math.floor(y), 1, 1, 0, 0, 0, 0);
  }

  getPixel(x: number, y: number): number {
    this.flush();
    const gl = this.gl;
    const px = Math.floor(x) - this.cameraX;
    const py = Math.floor(y) - this.cameraY;
    if (px < 0 || py < 0 || px >= SCREEN_WIDTH || py >= SCREEN_HEIGHT) return 0;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    const out = new Uint8Array(4);
    gl.readPixels(px, SCREEN_HEIGHT - 1 - py, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, out);
    return out[0] ?? 0;
  }

  line(x0: number, y0: number, x1: number, y1: number, colour: number): void {
    this.useBatch('solid', colour & 15, -1);
    x0 = Math.floor(x0);
    y0 = Math.floor(y0);
    x1 = Math.floor(x1);
    y1 = Math.floor(y1);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (let guard = 0; guard < 4096; guard++) {
      this.pushQuad(x0, y0, 1, 1, 0, 0, 0, 0);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  }

  rect(x: number, y: number, w: number, h: number, colour: number): void {
    x = Math.floor(x);
    y = Math.floor(y);
    w = Math.floor(w);
    h = Math.floor(h);
    if (w <= 0 || h <= 0) return;
    this.useBatch('solid', colour & 15, -1);
    this.pushQuad(x, y, w, 1, 0, 0, 0, 0);
    if (h > 1) this.pushQuad(x, y + h - 1, w, 1, 0, 0, 0, 0);
    if (h > 2) {
      this.pushQuad(x, y + 1, 1, h - 2, 0, 0, 0, 0);
      if (w > 1) this.pushQuad(x + w - 1, y + 1, 1, h - 2, 0, 0, 0, 0);
    }
  }

  fillRect(x: number, y: number, w: number, h: number, colour: number): void {
    w = Math.floor(w);
    h = Math.floor(h);
    if (w <= 0 || h <= 0) return;
    this.useBatch('solid', colour & 15, -1);
    this.pushQuad(Math.floor(x), Math.floor(y), w, h, 0, 0, 0, 0);
  }

  circle(cx: number, cy: number, r: number, colour: number): void {
    cx = Math.floor(cx);
    cy = Math.floor(cy);
    r = Math.floor(r);
    if (r < 0) return;
    this.useBatch('solid', colour & 15, -1);
    let x = r;
    let y = 0;
    let err = 1 - r;
    while (x >= y) {
      for (const [px, py] of [
        [x, y],
        [y, x],
        [-y, x],
        [-x, y],
        [-x, -y],
        [-y, -x],
        [y, -x],
        [x, -y],
      ] as const)
        this.pushQuad(cx + px, cy + py, 1, 1, 0, 0, 0, 0);
      y++;
      if (err < 0) err += 2 * y + 1;
      else {
        x--;
        err += 2 * (y - x) + 1;
      }
    }
  }

  fillCircle(cx: number, cy: number, r: number, colour: number): void {
    cx = Math.floor(cx);
    cy = Math.floor(cy);
    r = Math.floor(r);
    if (r < 0) return;
    this.useBatch('solid', colour & 15, -1);
    for (let dy = -r; dy <= r; dy++) {
      const dx = Math.floor(Math.sqrt(r * r - dy * dy));
      this.pushQuad(cx - dx, cy + dy, dx * 2 + 1, 1, 0, 0, 0, 0);
    }
  }

  print(text: string, x: number, y: number, colour: number): number {
    this.useBatch('font', -1, colour & 15);
    x = Math.floor(x);
    y = Math.floor(y);
    let cx = x;
    let cy = y;
    const atlasW = 95 * FONT_WIDTH;
    for (const ch of text) {
      if (ch === '\n') {
        cx = x;
        cy += FONT_HEIGHT;
        continue;
      }
      const g = glyphIndex(ch);
      const u0 = (g * FONT_WIDTH) / atlasW;
      const u1 = ((g + 1) * FONT_WIDTH) / atlasW;
      this.pushQuad(cx, cy, FONT_WIDTH, FONT_HEIGHT, u0, 0, u1, 1);
      cx += FONT_WIDTH;
    }
    return cx - x;
  }

  // ---- palettes -------------------------------------------------------------

  setCol(from: number, to: number): void {
    this.flush();
    this.remap[from & 15] = to & 15;
    this.remapDirty = true;
  }

  resetCol(): void {
    this.flush();
    for (let i = 0; i < 16; i++) this.remap[i] = i;
    this.remapDirty = true;
  }

  setTransparent(index: number, on: boolean): void {
    this.flush();
    if (on) this.transparentMask |= 1 << (index & 15);
    else this.transparentMask &= ~(1 << (index & 15));
    this.remapDirty = true;
  }

  setColour(index: number, hex: string): void {
    this.writePalette(0, index & 15, hex);
  }

  getColour(index: number): string {
    const o = (index & 15) * 4;
    return rgbToHex(this.palettes[o] ?? 0, this.palettes[o + 1] ?? 0, this.palettes[o + 2] ?? 0);
  }

  resetPalette(): void {
    for (let row = 0; row < PALETTE_SIZE; row++)
      for (let i = 0; i < PALETTE_SIZE; i++)
        this.writePalette(row, i, this.gamePalette[i] ?? '#000000');
  }

  setPaletteRow(row: number, colours: readonly string[]): void {
    row = row & 15;
    colours.slice(0, PALETTE_SIZE).forEach((c, i) => {
      this.writePalette(row, i, c);
    });
  }

  screenCol(from: number, to: number, row: number): void {
    const src = ((row & 15) * PALETTE_SIZE + (to & 15)) * 4;
    const dst = ((row & 15) * PALETTE_SIZE + (from & 15)) * 4;
    for (let k = 0; k < 4; k++) this.palettes[dst + k] = this.palettes[src + k] ?? 0;
    this.palettesDirty = true;
  }

  // ---- effects --------------------------------------------------------------

  scanline(y: number, fx: ScanlineEffect): void {
    y = Math.floor(y);
    if (y < 0 || y >= SCREEN_HEIGHT) return;
    const o = y * 4;
    if (fx.shiftX !== undefined) this.effects[o] = Math.round(fx.shiftX);
    if (fx.shiftY !== undefined) this.effects[o + 1] = Math.round(fx.shiftY);
    if (fx.palette !== undefined) this.effects[o + 2] = fx.palette & 15;
    let flags = this.effects[o + 3] ?? 0;
    if (fx.wrap !== undefined) flags = fx.wrap ? flags | FX_WRAP : flags & ~FX_WRAP;
    if (fx.blank !== undefined) flags = fx.blank ? flags | FX_BLANK : flags & ~FX_BLANK;
    this.effects[o + 3] = flags;
    this.effectsDirty = true;
    this.effectsUsed = true;
  }

  resetScanlines(): void {
    this.effects.fill(0);
    this.effectsDirty = true;
    this.effectsUsed = false;
  }

  persistEffects(on: boolean): void {
    this.persist = on;
  }

  screenshot(): Uint8ClampedArray | null {
    const gl = this.gl;
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    const buf = new Uint8Array(w * h * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    const out = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++)
      out.set(buf.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
    return out;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const u of this.unsubscribes) u();
    const gl = this.gl;
    gl.deleteProgram(this.drawProgram);
    gl.deleteProgram(this.presentProgram);
    gl.deleteFramebuffer(this.fbo);
    gl.deleteVertexArray(this.vao);
    gl.deleteBuffer(this.posBuffer);
    gl.deleteBuffer(this.uvBuffer);
    for (const t of this.textures) gl.deleteTexture(t);
  }

  // ---- internals ------------------------------------------------------------

  private tex(unit: number): WebGLTexture {
    const t = this.textures[unit];
    if (!t) throw new Error(`texture unit ${String(unit)} missing`);
    return t;
  }

  private writePalette(row: number, index: number, hex: string): void {
    const [r, g, b] = hexToRgb(hex);
    const o = (row * PALETTE_SIZE + index) * 4;
    this.palettes[o] = r;
    this.palettes[o + 1] = g;
    this.palettes[o + 2] = b;
    this.palettes[o + 3] = 255;
    this.palettesDirty = true;
  }

  private applyClip(): void {
    const gl = this.gl;
    if (this.clipRect) {
      const [x, y, w, h] = this.clipRect;
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(x, SCREEN_HEIGHT - y - h, w, h);
    } else gl.disable(gl.SCISSOR_TEST);
  }

  private useBatch(source: BatchSource, solid: number, textColour: number): void {
    if (
      source === this.batchSource &&
      solid === this.batchSolid &&
      textColour === this.batchTextColour
    )
      return;
    this.flush();
    this.batchSource = source;
    this.batchSolid = solid;
    this.batchTextColour = textColour;
  }

  private pushQuad(
    x: number,
    y: number,
    w: number,
    h: number,
    u0: number,
    v0: number,
    u1: number,
    v1: number,
  ): void {
    const x1 = x + w;
    const y1 = y + h;
    this.verts.push(x, y, x1, y, x, y1, x, y1, x1, y, x1, y1);
    this.uvs.push(u0, v0, u1, v0, u0, v1, u0, v1, u1, v0, u1, v1);
    if (this.verts.length > 12 * 4096) this.flush();
  }

  private flush(): void {
    if (this.verts.length === 0) return;
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
    gl.useProgram(this.drawProgram);
    gl.bindVertexArray(this.vao);
    const unit =
      this.batchSource === 'sheet'
        ? UNIT_SHEET
        : this.batchSource === 'map'
          ? UNIT_MAP
          : this.batchSource === 'font'
            ? UNIT_FONT
            : UNIT_SHEET;
    gl.uniform1i(this.uSrc, unit);
    gl.uniform1i(this.uSolid, this.batchSource === 'solid' ? this.batchSolid : -1);
    if (this.batchSource === 'font') {
      // Glyph atlas holds 0/1: map 1 → colour, and hide 0.
      const r = new Int32Array(16);
      r.set(this.remap);
      r[1] = this.remap[this.batchTextColour] ?? this.batchTextColour;
      gl.uniform1iv(this.uRemap, r);
      gl.uniform1i(this.uTransparent, 1);
      this.remapDirty = true;
    } else if (this.remapDirty) {
      gl.uniform1iv(this.uRemap, this.remap);
      gl.uniform1i(this.uTransparent, this.batchSource === 'solid' ? 0 : this.transparentMask);
      this.remapDirty = false;
    } else if (this.batchSource === 'solid') {
      gl.uniform1i(this.uTransparent, 0);
      this.remapDirty = true;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.verts), gl.STREAM_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.uvs), gl.STREAM_DRAW);
    gl.drawArrays(gl.TRIANGLES, 0, this.verts.length / 2);
    this.verts = [];
    this.uvs = [];
  }

  private uploadSheetRegion(changes: { x: number; y: number }[]): void {
    let minX = SHEET_WIDTH,
      minY = SHEET_HEIGHT,
      maxX = -1,
      maxY = -1;
    for (const c of changes) {
      if (c.x < minX) minX = c.x;
      if (c.x > maxX) maxX = c.x;
      if (c.y < minY) minY = c.y;
      if (c.y > maxY) maxY = c.y;
    }
    if (maxX < 0) return;
    const w = maxX - minX + 1;
    const h = maxY - minY + 1;
    const region = new Uint8Array(w * h);
    for (let y = 0; y < h; y++)
      region.set(
        this.game.sheet.subarray(
          (minY + y) * SHEET_WIDTH + minX,
          (minY + y) * SHEET_WIDTH + minX + w,
        ),
        y * w,
      );
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + UNIT_SHEET);
    gl.bindTexture(gl.TEXTURE_2D, this.tex(UNIT_SHEET));
    gl.texSubImage2D(gl.TEXTURE_2D, 0, minX, minY, w, h, gl.RED, gl.UNSIGNED_BYTE, region);
  }

  private rebuildMap(): void {
    const sheet = this.game.sheet;
    const tiles = this.game.tiles;
    for (let ty = 0; ty < MAP_HEIGHT; ty++) {
      for (let tx = 0; tx < MAP_WIDTH; tx++) {
        const n = tiles[ty * MAP_WIDTH + tx] ?? 0;
        const sx = (n % SPRITES_PER_ROW) * SPRITE_SIZE;
        const sy = Math.floor(n / SPRITES_PER_ROW) * SPRITE_SIZE;
        for (let y = 0; y < SPRITE_SIZE; y++) {
          const src = (sy + y) * SHEET_WIDTH + sx;
          const dst = (ty * SPRITE_SIZE + y) * MAP_PX_W + tx * SPRITE_SIZE;
          if (n === 0) this.mapPixels.fill(0, dst, dst + SPRITE_SIZE);
          else this.mapPixels.set(sheet.subarray(src, src + SPRITE_SIZE), dst);
        }
      }
    }
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + UNIT_MAP);
    gl.bindTexture(gl.TEXTURE_2D, this.tex(UNIT_MAP));
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      0,
      0,
      MAP_PX_W,
      MAP_PX_H,
      gl.RED,
      gl.UNSIGNED_BYTE,
      this.mapPixels,
    );
    this.mapDirty = false;
  }
}
