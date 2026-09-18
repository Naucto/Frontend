import type { GfxBackend, ScanlineEffect } from '../api/ports';
import type { Game, PixelChange } from '../game/Game';
import type { GameMap } from '../game/GameMap';
import { PALETTE_SIZE, SCREEN_HEIGHT, SCREEN_WIDTH, SPRITE_SIZE } from '../game/keys';
import { buildFontAtlas, FONT_HEIGHT, FONT_WIDTH, glyphIndex } from './Font';
import { createGLContext, createTexture, hexToRgb, linkProgram, rgbToHex } from './glUtils';
import { DRAW_FS, DRAW_VS, PRESENT_FS, PRESENT_VS } from './shaders';

/** One colour kept clear, as the bitmask the shader reads. */
const keyed = (colour: number | null): number => (colour === null ? 0 : 1 << (colour & 15));

/** The map is drawn without a call to ask, so it takes the default a sprite would. */
const MAP_KEY = 0;

const UNIT_SHEET = 0;
const UNIT_MAP = 1;
const UNIT_FONT = 2;
const UNIT_FRAME = 3;
const UNIT_EFFECTS = 4;
const UNIT_PALETTES = 5;

/** One map's texture and the pixels it was last built from, at that map's own size. */
interface MapTexture {
  tex: WebGLTexture;
  pixels: Uint8Array;
  width: number;
  height: number;
  dirty: boolean;
}
const FX_WRAP = 1;
const FX_BLANK = 2;

/** Quads one draw call carries; a batch that grows past it is drawn in two. */
const MAX_QUADS = 4096;
/** Two triangles: six vertices of two floats. */
const FLOATS_PER_QUAD = 12;

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

  /**
   * Vertex scratch, written in place and uploaded up to `quadCount`. A flush happens several times
   * a frame, so the arrays and the GL buffers behind them are sized once for the largest batch.
   */
  private readonly verts = new Float32Array(MAX_QUADS * FLOATS_PER_QUAD);
  private readonly uvs = new Float32Array(MAX_QUADS * FLOATS_PER_QUAD);
  private quadCount = 0;
  private batchSource: BatchSource = 'sheet';
  private batchTexture = '';
  /** One per sheet, keyed by its id. They take turns on the sheet texture unit. */
  private readonly sheetTextures = new Map<string, WebGLTexture>();
  /** One per map, keyed by its id, on the map texture unit the same way. */
  private readonly mapTextures = new Map<string, MapTexture>();
  private batchSolid = -1;
  private batchTextColour = -1;
  private batchTransparent = 1;

  private cameraX = 0;
  private cameraY = 0;
  private clipRect: [number, number, number, number] | null = null;
  private readonly remap = new Int32Array(16);
  private remapDirty = true;

  private readonly effects = new Int16Array(SCREEN_HEIGHT * 4);
  private effectsDirty = true;
  private effectsUsed = false;
  private persist = false;
  private readonly palettes = new Uint8Array(PALETTE_SIZE * PALETTE_SIZE * 4);
  private palettesDirty = true;
  private gamePalette: string[];

  /**
   * The tiles the running game has changed, which the document does not hold.
   *
   * A cache of what the engine wrote, per map by id, kept here because a map texture is rebuilt
   * from the whole document and would otherwise paint over them on the next rebuild.
   */
  private readonly tileOverrides = new Map<string, Map<number, number>>();
  /** Where a screenshot is presented, made the first time one is asked for. */
  private grab: { fbo: WebGLFramebuffer; rbo: WebGLRenderbuffer } | null = null;
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
    // maps (built lazily, one texture each)
    this.allocateTextures();
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
    gl.bufferData(gl.ARRAY_BUFFER, this.verts.byteLength, gl.STREAM_DRAW);
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.uvs.byteLength, gl.STREAM_DRAW);
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
        for (const held of this.mapTextures.values()) held.dirty = true;
      }),
      game.onTilesChange((changes) => {
        for (const c of changes) {
          const held = this.mapTextures.get(c.map);
          if (held) held.dirty = true;
        }
      }),
      game.onPaletteChange(() => {
        this.gamePalette = game.palette;
        this.resetPalette();
      }),
      // A texture is allocated at one size and cannot be resized, so a game that changes shape gets
      // new ones. Rare enough to redo wholesale rather than track.
      game.onGeometryChange(() => {
        this.allocateTextures();
      }),
      // A sheet or a map added, dropped or resized changes the set of textures without changing
      // the shape the geometry records, so the two are watched separately.
      game.onCollectionsChange(() => {
        this.allocateTextures();
      }),
    );
    this.clear(0);
    this.present();
  }

  /**
   * Gives every sheet, and every map, a texture of its own at its own size.
   *
   * One per sheet rather than one atlas: the sheets are no longer the same shape as each other, so
   * there is no grid to lay them out on, and a texture is allocated at one size and cannot be
   * resized. They share a single texture *unit* — which one is bound is decided per batch. The
   * maps are held the same way on their own unit.
   */
  private allocateTextures(): void {
    const gl = this.gl;
    const sheets = this.game.sheets;

    for (const [id, tex] of this.sheetTextures)
      if (!sheets.some((s) => s.id === id)) {
        gl.deleteTexture(tex);
        this.sheetTextures.delete(id);
      }

    gl.activeTexture(gl.TEXTURE0 + UNIT_SHEET);
    for (const sheet of sheets) {
      let tex = this.sheetTextures.get(sheet.id);
      if (!tex) {
        tex = createTexture(gl, UNIT_SHEET);
        this.sheetTextures.set(sheet.id, tex);
      }
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.R8,
        sheet.width,
        sheet.height,
        0,
        gl.RED,
        gl.UNSIGNED_BYTE,
        sheet.pixels,
      );
    }

    const maps = this.game.maps;
    for (const [id, held] of this.mapTextures)
      if (!maps.some((m) => m.id === id)) {
        gl.deleteTexture(held.tex);
        this.mapTextures.delete(id);
        this.tileOverrides.delete(id);
      }

    gl.activeTexture(gl.TEXTURE0 + UNIT_MAP);
    for (const map of maps) {
      const width = map.width * SPRITE_SIZE;
      const height = map.height * SPRITE_SIZE;
      const held = this.mapTextures.get(map.id);
      if (held?.width === width && held.height === height) {
        held.dirty = true;
        continue;
      }
      const tex = held?.tex ?? createTexture(gl, UNIT_MAP);
      this.mapTextures.set(map.id, {
        tex,
        pixels: new Uint8Array(width * height),
        width,
        height,
        dirty: true,
      });
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, width, height, 0, gl.RED, gl.UNSIGNED_BYTE, null);
    }
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

  /**
   * Pass 2 onto `target`: the index frame through the effect table and the palette. It reads
   * nothing but textures, so the same picture can be drawn again onto another target.
   */
  private presentTo(target: WebGLFramebuffer | null, w: number, h: number): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target);
    gl.disable(gl.SCISSOR_TEST);
    gl.viewport(0, 0, w, h);
    gl.useProgram(this.presentProgram);
    gl.bindVertexArray(null);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  present(): void {
    const gl = this.gl;
    this.flush();
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
    this.presentTo(null, gl.drawingBufferWidth, gl.drawingBufferHeight);
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
    keyColour: number | null,
  ): void {
    n = Math.floor(n);
    // Through the sheet that answers to this number, not through the first one: sprite numbers run
    // on from one sheet to the next, and the sheets are no longer the same size as each other.
    const sheet = this.game.sheetOf(n) ?? this.game.sheets[0];
    if (!sheet) return;
    const { x: sx, y: sy } = sheet.originOf(n);
    const sw = Math.floor(w) * SPRITE_SIZE;
    const sh = Math.floor(h) * SPRITE_SIZE;
    this.pushSheetQuad(
      sheet.id,
      sheet.width,
      sheet.height,
      sx,
      sy,
      sw,
      sh,
      x,
      y,
      sw * scale,
      sh * scale,
      flipH,
      flipV,
      keyColour,
    );
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
    keyColour: number | null,
  ): void {
    // A rectangle in sheet pixels names no sheet, so it reads the first one — which is the only
    // sheet a game written before there were several could have meant.
    const sheet = this.game.sheets[0];
    if (!sheet) return;
    this.pushSheetQuad(
      sheet.id,
      sheet.width,
      sheet.height,
      sx,
      sy,
      sw,
      sh,
      dx,
      dy,
      dw,
      dh,
      flipH,
      flipV,
      keyColour,
    );
  }

  private pushSheetQuad(
    sheetId: string,
    sheetWidth: number,
    sheetHeight: number,
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
  ): void {
    this.useBatch('sheet', -1, -1, keyed(keyColour), sheetId);
    let u0 = sx / sheetWidth;
    let v0 = sy / sheetHeight;
    let u1 = (sx + sw) / sheetWidth;
    let v1 = (sy + sh) / sheetHeight;
    if (flipH) [u0, u1] = [u1, u0];
    if (flipV) [v0, v1] = [v1, v0];
    this.pushQuad(Math.floor(dx), Math.floor(dy), Math.floor(dw), Math.floor(dh), u0, v0, u1, v1);
  }

  setTileOverride(x: number, y: number, sprite: number, map: number): void {
    const m = this.game.maps[map];
    const held = m && this.mapTextures.get(m.id);
    if (!m || !held || x < 0 || x >= m.width || y < 0 || y >= m.height) return;
    let mine = this.tileOverrides.get(m.id);
    if (!mine) {
      mine = new Map();
      this.tileOverrides.set(m.id, mine);
    }
    mine.set(y * m.width + x, sprite & 0xffff);
    held.dirty = true;
  }

  clearTileOverrides(): void {
    if (this.tileOverrides.size === 0) return;
    this.tileOverrides.clear();
    for (const held of this.mapTextures.values()) held.dirty = true;
  }

  drawMap(x: number, y: number, tx: number, ty: number, tw: number, th: number, map: number): void {
    const m = this.game.maps[map];
    const held = m && this.mapTextures.get(m.id);
    if (!m || !held) return;
    if (held.dirty) this.rebuildMap(m, held);
    this.useBatch('map', -1, -1, keyed(MAP_KEY), m.id);
    const px = tx * SPRITE_SIZE;
    const py = ty * SPRITE_SIZE;
    const pw = tw * SPRITE_SIZE;
    const ph = th * SPRITE_SIZE;
    this.pushQuad(
      Math.floor(x),
      Math.floor(y),
      pw,
      ph,
      px / held.width,
      py / held.height,
      (px + pw) / held.width,
      (py + ph) / held.height,
    );
  }

  pixel(x: number, y: number, colour: number): void {
    this.useBatch('solid', colour & 15, -1, 0);
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
    this.useBatch('solid', colour & 15, -1, 0);
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
    this.useBatch('solid', colour & 15, -1, 0);
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
    this.useBatch('solid', colour & 15, -1, 0);
    this.pushQuad(Math.floor(x), Math.floor(y), w, h, 0, 0, 0, 0);
  }

  circle(cx: number, cy: number, r: number, colour: number): void {
    cx = Math.floor(cx);
    cy = Math.floor(cy);
    r = Math.floor(r);
    if (r < 0) return;
    this.useBatch('solid', colour & 15, -1, 0);
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
    this.useBatch('solid', colour & 15, -1, 0);
    for (let dy = -r; dy <= r; dy++) {
      const dx = Math.floor(Math.sqrt(r * r - dy * dy));
      this.pushQuad(cx - dx, cy + dy, dx * 2 + 1, 1, 0, 0, 0, 0);
    }
  }

  print(text: string, x: number, y: number, colour: number): number {
    this.useBatch('font', -1, colour & 15, 1);
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

  /**
   * The drawing buffer is not kept past compositing, so the picture is presented a second time,
   * into a target of its own. Everything that pass reads — the index frame, the effect table, the
   * palettes — is retained on the GPU exactly as the last `present()` left it, so what comes back
   * is the frame on screen. Keeping the drawing buffer instead would cost a copy of it on every
   * composited frame, for a grab that happens once.
   */
  screenshot(): Uint8ClampedArray | null {
    const gl = this.gl;
    const w = SCREEN_WIDTH;
    const h = SCREEN_HEIGHT;
    if (!this.grab) {
      const rbo = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, rbo);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.RGBA8, w, h);
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, rbo);
      this.grab = { fbo, rbo };
    }
    this.presentTo(this.grab.fbo, w, h);
    const buf = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
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
    if (this.grab) {
      gl.deleteFramebuffer(this.grab.fbo);
      gl.deleteRenderbuffer(this.grab.rbo);
    }
    for (const t of this.textures) gl.deleteTexture(t);
    for (const t of this.sheetTextures.values()) gl.deleteTexture(t);
    for (const held of this.mapTextures.values()) gl.deleteTexture(held.tex);
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

  /**
   * Every quad queued since the last flush is drawn with the uniforms current at that flush. A value
   * those uniforms are built from therefore has to end the batch when it changes, or it reaches
   * backwards over everything already waiting.
   */
  private useBatch(
    source: BatchSource,
    solid: number,
    textColour: number,
    transparent: number,
    /** Which sheet or map the batch reads. A batch draws with one texture bound, so a second
        sheet, or a second map, is a second batch. */
    texture = '',
  ): void {
    if (
      source === this.batchSource &&
      solid === this.batchSolid &&
      textColour === this.batchTextColour &&
      transparent === this.batchTransparent &&
      texture === this.batchTexture
    )
      return;
    this.flush();
    this.batchSource = source;
    this.batchSolid = solid;
    this.batchTextColour = textColour;
    this.batchTransparent = transparent;
    this.batchTexture = texture;
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
    const o = this.quadCount * FLOATS_PER_QUAD;
    const p = this.verts;
    const t = this.uvs;
    p[o] = x;
    p[o + 1] = y;
    p[o + 2] = x1;
    p[o + 3] = y;
    p[o + 4] = x;
    p[o + 5] = y1;
    p[o + 6] = x;
    p[o + 7] = y1;
    p[o + 8] = x1;
    p[o + 9] = y;
    p[o + 10] = x1;
    p[o + 11] = y1;
    t[o] = u0;
    t[o + 1] = v0;
    t[o + 2] = u1;
    t[o + 3] = v0;
    t[o + 4] = u0;
    t[o + 5] = v1;
    t[o + 6] = u0;
    t[o + 7] = v1;
    t[o + 8] = u1;
    t[o + 9] = v0;
    t[o + 10] = u1;
    t[o + 11] = v1;
    this.quadCount++;
    if (this.quadCount === MAX_QUADS) this.flush();
  }

  private flush(): void {
    if (this.quadCount === 0) return;
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
    if (this.batchSource === 'sheet') {
      gl.activeTexture(gl.TEXTURE0 + UNIT_SHEET);
      gl.bindTexture(gl.TEXTURE_2D, this.sheetTextures.get(this.batchTexture) ?? null);
    } else if (this.batchSource === 'map') {
      gl.activeTexture(gl.TEXTURE0 + UNIT_MAP);
      gl.bindTexture(gl.TEXTURE_2D, this.mapTextures.get(this.batchTexture)?.tex ?? null);
    }
    gl.uniform1i(this.uSrc, unit);
    gl.uniform1i(this.uSolid, this.batchSource === 'solid' ? this.batchSolid : -1);
    gl.uniform1i(this.uTransparent, this.batchTransparent);
    if (this.batchSource === 'font') {
      // Glyph atlas holds 0/1: map 1 → colour, and hide 0.
      const r = new Int32Array(16);
      r.set(this.remap);
      r[1] = this.remap[this.batchTextColour] ?? this.batchTextColour;
      gl.uniform1iv(this.uRemap, r);
      this.remapDirty = true;
    } else if (this.remapDirty) {
      gl.uniform1iv(this.uRemap, this.remap);
      this.remapDirty = false;
    }
    const n = this.quadCount * FLOATS_PER_QUAD;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.verts, 0, n);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.uvs, 0, n);
    gl.drawArrays(gl.TRIANGLES, 0, this.quadCount * 6);
    this.quadCount = 0;
  }

  /** Sorted by sheet first: one rectangle covering two sheets is not a rectangle on either. */
  private uploadSheetRegion(changes: PixelChange[]): void {
    const bySheet = new Map<string, PixelChange[]>();
    for (const c of changes) {
      const list = bySheet.get(c.sheet);
      if (list) list.push(c);
      else bySheet.set(c.sheet, [c]);
    }
    const gl = this.gl;
    for (const [id, list] of bySheet) {
      const sheet = this.game.sheets.find((s) => s.id === id);
      const tex = this.sheetTextures.get(id);
      if (!sheet || !tex) continue;
      let minX = sheet.width,
        minY = sheet.height,
        maxX = -1,
        maxY = -1;
      for (const c of list) {
        if (c.x < minX) minX = c.x;
        if (c.x > maxX) maxX = c.x;
        if (c.y < minY) minY = c.y;
        if (c.y > maxY) maxY = c.y;
      }
      if (maxX < 0) continue;
      const w = maxX - minX + 1;
      const h = maxY - minY + 1;
      const region = new Uint8Array(w * h);
      for (let y = 0; y < h; y++)
        region.set(
          sheet.pixels.subarray(
            (minY + y) * sheet.width + minX,
            (minY + y) * sheet.width + minX + w,
          ),
          y * w,
        );
      gl.activeTexture(gl.TEXTURE0 + UNIT_SHEET);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, minX, minY, w, h, gl.RED, gl.UNSIGNED_BYTE, region);
    }
  }

  private rebuildMap(map: GameMap, held: MapTexture): void {
    const tiles = map.tiles;
    const overrides = this.tileOverrides.get(map.id);
    // Each tile through the sheet its own number belongs to: a map is free to mix them, and read
    // off one sheet a tile from another lands on whatever pixels happen to be at that offset.
    for (let ty = 0; ty < map.height; ty++) {
      for (let tx = 0; tx < map.width; tx++) {
        const i = ty * map.width + tx;
        const n = overrides?.get(i) ?? tiles[i] ?? 0;
        const sheet = this.game.sheetOf(n);
        const { x: sx, y: sy } = sheet?.originOf(n) ?? { x: 0, y: 0 };
        for (let y = 0; y < SPRITE_SIZE; y++) {
          const dst = (ty * SPRITE_SIZE + y) * held.width + tx * SPRITE_SIZE;
          if (n === 0 || !sheet) {
            held.pixels.fill(0, dst, dst + SPRITE_SIZE);
            continue;
          }
          const src = (sy + y) * sheet.width + sx;
          held.pixels.set(sheet.pixels.subarray(src, src + SPRITE_SIZE), dst);
        }
      }
    }
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + UNIT_MAP);
    gl.bindTexture(gl.TEXTURE_2D, held.tex);
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      0,
      0,
      held.width,
      held.height,
      gl.RED,
      gl.UNSIGNED_BYTE,
      held.pixels,
    );
    held.dirty = false;
  }
}
