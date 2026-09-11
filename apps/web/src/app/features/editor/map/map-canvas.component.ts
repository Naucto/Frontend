import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  model,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { ThemeService } from '@app/core/theme/theme.service';
import { geometrySignal } from '@app/shared/pixel/geometry.signal';
import { cssVar, floodFill, linePoints, type Pt } from '@app/shared/pixel/pixel-tools';
import { type SheetAtlas } from '@app/shared/pixel/sheet-atlas';
import { type SheetPainter } from '@app/shared/pixel/sheet-painter';
import { type Game, SPRITE_SIZE } from '@naucto/engine';
import {
  DragPanDirective,
  FLAG_ACCENTS,
  PresenceLayerComponent,
  type PresenceMark,
  type PresenceViewport,
} from '@naucto/ui';
import type * as Y from 'yjs';

import { type Clip } from '../state/clipboard.store';
import { type Collaborator } from '../work-session/work-session.service';
import { type MapTool, type TileRect } from './map.store';

export interface TileViewport {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The chips that set these bits carry the same eight, so a marked tile and its flag agree. */
const FLAG_VARS = FLAG_ACCENTS.map((a) => `--nc-${a}`);

/** The whole tile map in a scrollable surface; stamps tiles from the sheet. */
/** Whether a tile sits inside a rectangle of tiles. */
function withinRect(r: TileRect, p: Pt): boolean {
  return p.x >= r.x && p.y >= r.y && p.x < r.x + r.w && p.y < r.y + r.h;
}

@Component({
  selector: 'nc-map-canvas',
  imports: [PresenceLayerComponent],
  template: `
    <div class="relative" [style.width.px]="cssW()" [style.height.px]="cssH()">
      <canvas
        #base
        class="pixelated absolute inset-0"
        [width]="cssW()"
        [height]="cssH()"
        aria-hidden="true"
      ></canvas>
      <canvas
        #overlay
        class="pixelated absolute inset-0 cursor-crosshair touch-none"
        [width]="cssW()"
        [height]="cssH()"
        role="img"
        [attr.aria-label]="label()"
        (pointerdown)="onDown($event)"
        (pointermove)="onMove($event)"
        (pointerup)="onUp()"
        (pointercancel)="onUp()"
        (pointerleave)="onLeave()"
        (contextmenu)="$event.preventDefault()"
      ></canvas>
      <nc-presence-layer [marks]="marks()" [viewport]="viewPx()" />
    </div>
  `,
  // A map smaller than the viewport is centred rather than pinned to the top-left; `safe` keeps
  // the origin reachable once it is larger.
  hostDirectives: [DragPanDirective],
  // The wheel is bound on the well rather than on the canvas, so it is answered over the gutter a
  // map smaller than the well is centred in.
  host: {
    class: 'flex overflow-auto [align-items:safe_center] [justify-content:safe_center]',
    tabindex: '0',
    '(wheel)': 'onWheel($event)',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapCanvasComponent {
  readonly game = input.required<Game>();
  readonly painter = input.required<SheetPainter>();
  /** Every sheet's pixels, because a map's tiles may come from any of them. */
  readonly atlas = input.required<SheetAtlas>();
  readonly tool = input<MapTool>('stamp');
  /** In sheet cells, not map cells: where the tiles come from, not where they land. */
  readonly brush = input<TileRect>({ x: 1, y: 0, w: 1, h: 1 });
  readonly grid = input(true);
  readonly flags = input(false);
  readonly zoom = input(2);
  readonly selection = model<TileRect | null>(null);
  readonly collaborators = input<readonly Collaborator[]>([]);
  readonly label = input('Map canvas');
  readonly hover = output<Pt | null>();
  /**
   * Where the pointer actually is, in fractional tiles.
   *
   * `hover` is snapped to whole tiles because that is the tile you are about to stamp. A cursor
   * shown to somebody else wants the opposite: a snapped position makes a peer's cursor jump a
   * whole tile at a time instead of moving.
   */
  readonly pointer = output<{ x: number; y: number } | null>();
  readonly viewport = output<TileViewport>();
  /** Ctrl/⌘ + wheel over the map zooms it, the way every other canvas surface in the app does. */
  readonly zoomBy = output<number>();
  /** A paste has been placed and wants the tool that can move it. */
  readonly pasted = output();
  /**
   * The manager the tab owns, so settling a paste is its own step.
   *
   * Settling happens on the press that starts the next stroke, and a stamp landing in the same
   * breath would otherwise be undone together with the paste it was laid over.
   */
  readonly undo = input<Y.UndoManager | null>(null);

  private readonly base = viewChild.required<ElementRef<HTMLCanvasElement>>('base');
  private readonly overlay = viewChild.required<ElementRef<HTMLCanvasElement>>('overlay');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly theme = inject(ThemeService);
  private readonly tilesVersion = signal(0);
  private readonly hoverCell = signal<Pt | null>(null);
  private drag: {
    start: Pt;
    last: Pt;
    erase: boolean;
    /** MOVE: the tiles taken off the map, and where they were. */
    lifted?: { rect: TileRect; cells: Uint8Array };
    /** MOVE, on a pasted layer: the drag carries the layer and the map beneath is untouched. */
    carrying?: boolean;
  } | null = null;
  private readonly moveOffset = signal<Pt | null>(null);
  /**
   * A pasted clip, placed but not written.
   *
   * While it exists the map is exactly as it was, so backing out costs nothing and the tiles it
   * covers are still there underneath. It becomes part of the map only when it is settled.
   */
  private readonly floating = signal<{ rect: TileRect; cells: Uint8Array } | null>(null);
  private rafBase = 0;
  private rafOverlay = 0;
  /** Tile size the view was last laid out at, so a change of scale can be anchored on its middle. */
  private lastTilePx = 0;

  protected readonly tilePx = computed(() => SPRITE_SIZE * this.zoom());
  private readonly geometry = geometrySignal(this.game);
  /**
   * The sheet the brush is picked from, as the picker beside it draws it.
   *
   * Read off the painter rather than taken as an input: the picker already follows the choice, and
   * a second way in would be a second thing to keep in step with it.
   */
  private readonly sheet = computed(() => {
    this.atlas().version();
    const id = this.painter().sheetId();
    const sheets = this.game().sheets;

    return sheets.find((sh) => sh.id === id) ?? sheets[0];
  });
  protected readonly mapW = computed(() => this.geometry().mapWidth);
  protected readonly mapH = computed(() => this.geometry().mapHeight);
  protected readonly cssW = computed(() => this.mapW() * this.tilePx());
  protected readonly cssH = computed(() => this.mapH() * this.tilePx());
  protected readonly marks = computed<PresenceMark[]>(() => {
    const t = this.tilePx();
    return this.collaborators()
      .filter((c) => !c.isSelf && c.cursor?.tab === 'map')
      .map((c) => ({
        id: c.clientId,
        name: c.name,
        colour: c.colour,
        x: (c.cursor?.x ?? 0) * t,
        y: (c.cursor?.y ?? 0) * t,
      }));
  });
  /**
   * What is on screen, in the drawn pixels the marks are placed in. A map smaller than its well
   * reports a frame wider than itself, which is right: every mark is then inside it.
   */
  protected readonly viewPx = signal<PresenceViewport>({ x: 0, y: 0, w: 0, h: 0 });

  constructor() {
    effect((onCleanup) => {
      const unsub = this.game().onTilesChange(() => {
        this.tilesVersion.update((v) => v + 1);
      });
      this.tilesVersion.update((v) => v + 1);
      onCleanup(unsub);
    });
    const el = this.host.nativeElement;
    const onScroll = (): void => {
      this.emitViewport();
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    const ro = new ResizeObserver(onScroll);
    ro.observe(el);
    inject(DestroyRef).onDestroy(() => {
      el.removeEventListener('scroll', onScroll);
      ro.disconnect();
      cancelAnimationFrame(this.rafBase);
      cancelAnimationFrame(this.rafOverlay);
    });
    effect(() => {
      this.atlas().version();
      this.tilesVersion();
      this.grid();
      this.flags();
      this.zoom();
      // Colours come from CSS custom properties read at paint time, so a theme flip has to repaint.
      this.theme.effective();
      untracked(() => {
        this.requestBase();
        this.emitViewport();
      });
    });
    effect(() => {
      this.hoverCell();
      this.selection();
      this.zoom();
      this.brush();
      this.tool();
      this.floating();
      this.moveOffset();
      this.theme.effective();
      untracked(() => {
        this.requestOverlay();
      });
    });
    /**
     * A placed paste settles when attention moves off it — any tool that is not the one that moves
     * it. Read untracked, because placing one must not settle it in the same breath, and the tool
     * changing *to* move is how a paste asks to be movable.
     */
    effect(() => {
      const movable = this.tool() === 'move';
      untracked(() => {
        if (!movable) this.settleFloating();
      });
    });
  }

  /** Scrolling is the wheel's; zooming asks for the modifier the browser reserves for it. */
  protected onWheel(e: WheelEvent): void {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    this.zoomBy.emit(e.deltaY < 0 ? 1 : -1);
  }

  /**
   * Puts back in the middle of the well whatever was there at the previous scale.
   *
   * The map scales about its own origin, so offsets left alone hold the top-left corner and nothing
   * else. Below the well's size the host centres the map itself, and there is nothing to hold.
   */
  private holdCentre(): void {
    const t = this.tilePx();
    const was = this.lastTilePx;
    this.lastTilePx = t;
    if (!was || was === t) return;
    const el = this.host.nativeElement;
    if (el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight) return;
    const x = (el.scrollLeft + el.clientWidth / 2) / was;
    const y = (el.scrollTop + el.clientHeight / 2) / was;
    el.scrollLeft = x * t - el.clientWidth / 2;
    el.scrollTop = y * t - el.clientHeight / 2;
  }

  /** Scrolls so the given tile is centred. */
  scrollToTile(x: number, y: number): void {
    const el = this.host.nativeElement;
    const t = this.tilePx();
    el.scrollTo({
      left: x * t - el.clientWidth / 2,
      top: y * t - el.clientHeight / 2,
      behavior: 'smooth',
    });
  }

  /** Nothing selected is nothing to copy: a map has no region in hand to fall back on. */
  copySelection(): Clip | null {
    const sel = this.selection();
    if (!sel) return null;
    const cells = new Uint8Array(sel.w * sel.h);
    const game = this.game();
    for (let y = 0; y < sel.h; y++)
      for (let x = 0; x < sel.w; x++) cells[y * sel.w + x] = game.getTile(sel.x + x, sel.y + y);
    return { kind: 'tiles', w: sel.w, h: sel.h, cells };
  }

  /**
   * Lands in the middle of the map, and writes nothing yet.
   *
   * The pointer used to decide, which is right for a keystroke and impossible for a button: the
   * click that asks for the paste is the same gesture that takes the pointer off the canvas, so
   * the aim was always null and the paste fell back onto the selection it came from -- writing the
   * same tiles over themselves. The middle is somewhere it will be seen, and it is only a starting
   * point, the layer being there to be moved.
   */
  pasteClip(clip: Clip): void {
    // A second paste settles the first rather than dropping it: work already placed is work.
    this.settleFloating();
    const centre = this.visibleCentre();
    const rect = this.clampToMap({
      x: Math.round(centre.x - clip.w / 2),
      y: Math.round(centre.y - clip.h / 2),
      w: clip.w,
      h: clip.h,
    });
    this.floating.set({ rect, cells: clip.cells });
    this.selection.set(rect);
    this.pasted.emit();
  }

  /**
   * The tile in the middle of what is on screen. The map is far wider than its well, so the map's
   * own middle is usually scrolled away.
   *
   * Measured off the canvas, exactly as a pointer is: the well centres content smaller than
   * itself, so its scroll offset is not the canvas's origin and reading one for the other puts the
   * answer a screenful out.
   */
  private visibleCentre(): { x: number; y: number } {
    const well = this.host.nativeElement;
    const box = well.getBoundingClientRect();
    const canvas = this.overlay().nativeElement.getBoundingClientRect();
    const t = this.tilePx();
    return {
      x: (box.left + well.clientWidth / 2 - canvas.left) / t,
      y: (box.top + well.clientHeight / 2 - canvas.top) / t,
    };
  }

  /** Keeps a rectangle whole and on the map, whichever way it was pushed. */
  private clampToMap(r: TileRect): TileRect {
    return {
      ...r,
      x: Math.max(0, Math.min(r.x, this.mapW() - r.w)),
      y: Math.max(0, Math.min(r.y, this.mapH() - r.h)),
    };
  }

  /** Writes the placed layer into the map, as one undo step. Silent when there is none. */
  settleFloating(): void {
    const layer = this.floating();
    if (!layer) return;
    this.floating.set(null);
    const { rect, cells } = layer;
    const game = this.game();
    this.undo()?.stopCapturing();
    game.transact(() => {
      for (let y = 0; y < rect.h; y++)
        for (let x = 0; x < rect.w; x++) {
          const tx = rect.x + x;
          const ty = rect.y + y;
          if (tx < this.mapW() && ty < this.mapH())
            game.setTile(tx, ty, cells[y * rect.w + x] ?? 0);
        }
    });
    this.undo()?.stopCapturing();
    this.selection.set(rect);
  }

  /** Drops the placed layer. Nothing was written, so there is nothing to undo. */
  discardFloating(): boolean {
    if (!this.floating()) return false;
    this.floating.set(null);
    return true;
  }

  /** Clears the selected tiles (Delete / Backspace). */
  clearSelection(): void {
    const sel = this.selection();
    if (!sel) return;
    this.game().transact(() => {
      for (let y = sel.y; y < sel.y + sel.h; y++)
        for (let x = sel.x; x < sel.x + sel.w; x++) this.game().setTile(x, y, 0);
    });
  }

  private emitViewport(): void {
    const el = this.host.nativeElement;
    const t = this.tilePx();
    this.viewPx.set({ x: el.scrollLeft, y: el.scrollTop, w: el.clientWidth, h: el.clientHeight });
    this.viewport.emit({
      x: el.scrollLeft / t,
      y: el.scrollTop / t,
      w: el.clientWidth / t,
      h: el.clientHeight / t,
    });
  }

  // ---- pointer --------------------------------------------------------------

  private cellOf(e: PointerEvent): Pt {
    const p = this.pointOf(e);
    return {
      x: Math.max(0, Math.min(this.mapW() - 1, Math.floor(p.x))),
      y: Math.max(0, Math.min(this.mapH() - 1, Math.floor(p.y))),
    };
  }

  /** The same position, unsnapped — see `pointer`. */
  private pointOf(e: PointerEvent): { x: number; y: number } {
    const r = this.overlay().nativeElement.getBoundingClientRect();
    const t = this.tilePx();
    return { x: (e.clientX - r.left) / t, y: (e.clientY - r.top) / t };
  }

  private stamp(cell: Pt, erase: boolean): void {
    const b = this.brush();
    this.game().transact(() => {
      const sheet = this.sheet();
      if (!sheet) return;
      for (let j = 0; j < b.h; j++)
        for (let i = 0; i < b.w; i++) {
          // Through the sheet the brush was picked from: a cell of it is only a sprite number once
          // the sheet's own width and its place in the run of them are both taken into account.
          const spr = erase ? 0 : sheet.base + (b.y + j) * sheet.cols + b.x + i;
          if (spr < sheet.base + sheet.count) this.game().setTile(cell.x + i, cell.y + j, spr);
        }
    });
  }

  protected onDown(e: PointerEvent): void {
    if (e.button !== 0 && e.button !== 2) return;
    this.host.nativeElement.focus({ preventScroll: true });
    this.overlay().nativeElement.setPointerCapture(e.pointerId);
    const cell = this.cellOf(e);
    const erase = e.button === 2 || this.tool() === 'erase';
    const layer = this.floating();
    if (layer && this.tool() === 'move' && withinRect(layer.rect, cell)) {
      this.drag = { start: cell, last: cell, erase, carrying: true };
      this.moveOffset.set({ x: 0, y: 0 });
      return;
    }
    // Anything else is done with the layer: a press elsewhere settles it rather than losing it.
    this.settleFloating();
    this.drag = { start: cell, last: cell, erase };
    switch (this.tool()) {
      case 'stamp':
      case 'erase':
        this.stamp(cell, erase);
        break;
      case 'fill': {
        const g = this.game();
        const pts = floodFill((x, y) => g.getTile(x, y), cell, this.mapW(), this.mapH());
        const sheet = this.sheet();
        if (!sheet) return;
        const spr = erase ? 0 : sheet.base + this.brush().y * sheet.cols + this.brush().x;
        g.transact(() => {
          for (const p of pts) g.setTile(p.x, p.y, spr);
        });
        this.drag = null;
        break;
      }
      case 'select':
        this.selection.set(null);
        break;
      case 'move': {
        const rect = this.selection();
        if (!rect || !withinRect(rect, cell)) {
          this.drag = null;
          break;
        }
        const game = this.game();
        const cells = new Uint8Array(rect.w * rect.h);
        for (let y = 0; y < rect.h; y++)
          for (let x = 0; x < rect.w; x++)
            cells[y * rect.w + x] = game.getTile(rect.x + x, rect.y + y);
        this.drag.lifted = { rect, cells };
        this.moveOffset.set({ x: 0, y: 0 });
        break;
      }
    }
  }

  protected onMove(e: PointerEvent): void {
    const cell = this.cellOf(e);
    this.hoverCell.set(cell);
    this.hover.emit(cell);
    this.pointer.emit(this.pointOf(e));
    const d = this.drag;
    if (!d || (cell.x === d.last.x && cell.y === d.last.y)) return;
    if (this.tool() === 'stamp' || this.tool() === 'erase') {
      for (const p of linePoints(d.last, cell)) this.stamp(p, d.erase);
    } else if (d.carrying === true || d.lifted) {
      this.moveOffset.set({ x: cell.x - d.start.x, y: cell.y - d.start.y });
    } else if (this.tool() === 'select') {
      this.selection.set({
        x: Math.min(d.start.x, cell.x),
        y: Math.min(d.start.y, cell.y),
        w: Math.abs(d.start.x - cell.x) + 1,
        h: Math.abs(d.start.y - cell.y) + 1,
      });
    }
    d.last = cell;
  }

  protected onUp(): void {
    const d = this.drag;
    this.drag = null;
    const off = this.moveOffset();
    this.moveOffset.set(null);
    if (!d || !off) return;
    if (d.carrying === true) {
      const layer = this.floating();
      if (!layer) return;
      const rect = this.clampToMap({
        ...layer.rect,
        x: layer.rect.x + off.x,
        y: layer.rect.y + off.y,
      });
      this.floating.set({ ...layer, rect });
      this.selection.set(rect);
      return;
    }
    if (!d.lifted || (off.x === 0 && off.y === 0)) return;
    // Cut and lay down together, so a move is one step to undo and never leaves a copy behind.
    const { rect, cells } = d.lifted;
    const game = this.game();
    game.transact(() => {
      for (let y = 0; y < rect.h; y++)
        for (let x = 0; x < rect.w; x++) game.setTile(rect.x + x, rect.y + y, 0);
      for (let y = 0; y < rect.h; y++)
        for (let x = 0; x < rect.w; x++) {
          const tx = rect.x + x + off.x;
          const ty = rect.y + y + off.y;
          if (tx >= 0 && ty >= 0 && tx < this.mapW() && ty < this.mapH())
            game.setTile(tx, ty, cells[y * rect.w + x] ?? 0);
        }
    });
    this.selection.set(this.clampToMap({ ...rect, x: rect.x + off.x, y: rect.y + off.y }));
  }

  protected onLeave(): void {
    this.hoverCell.set(null);
    this.hover.emit(null);
    this.pointer.emit(null);
  }

  // ---- drawing --------------------------------------------------------------

  private requestBase(): void {
    cancelAnimationFrame(this.rafBase);
    this.rafBase = requestAnimationFrame(() => {
      // Inside the frame: the map's size is a template binding, and an offset written before it
      // lands is clamped against the width the element still has.
      this.holdCentre();
      this.drawBase();
      this.emitViewport();
    });
  }

  private requestOverlay(): void {
    cancelAnimationFrame(this.rafOverlay);
    this.rafOverlay = requestAnimationFrame(() => {
      this.drawOverlay();
    });
  }

  private drawBase(): void {
    const el = this.base().nativeElement;
    const ctx = el.getContext('2d');
    if (!ctx) return;
    const t = this.tilePx();
    const w = this.cssW();
    const h = this.cssH();
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = cssVar(el, '--nc-inset');
    ctx.fillRect(0, 0, w, h);
    const game = this.game();
    const atlas = this.atlas();
    const tiles = game.tiles;
    const showFlags = this.flags();
    const flagColours = FLAG_VARS.map((v) => cssVar(el, v));
    const mapW = this.mapW();
    for (let y = 0; y < this.mapH(); y++)
      for (let x = 0; x < mapW; x++) {
        const spr = tiles[y * mapW + x] ?? 0;
        if (!spr) continue;
        // Through the sheet that answers to this number: a map mixes them freely, and read off one
        // sheet a tile from another lands on whatever pixels happen to sit at that offset.
        const o = atlas.sourceOf(spr);
        if (!o) continue;
        ctx.drawImage(o.canvas, o.x, o.y, SPRITE_SIZE, SPRITE_SIZE, x * t, y * t, t, t);
        if (showFlags) {
          const f = game.getFlag(spr);
          if (f) {
            const bit = Math.log2(f & -f);
            ctx.globalAlpha = 0.4;
            ctx.fillStyle = flagColours[bit] ?? '#fff';
            ctx.fillRect(x * t, y * t, t, t);
            ctx.globalAlpha = 1;
          }
        }
      }
    if (this.grid()) {
      // The design draws the fine grid at 6% — legible over dark tiles without hatching them.
      ctx.globalAlpha = 0.06;
      ctx.strokeStyle = cssVar(el, '--nc-ink');
      ctx.beginPath();
      for (let x = 1; x < this.mapW(); x++) {
        if (x % 8 === 0) continue;
        ctx.moveTo(x * t + 0.5, 0);
        ctx.lineTo(x * t + 0.5, h);
      }
      for (let y = 1; y < this.mapH(); y++) {
        if (y % 8 === 0) continue;
        ctx.moveTo(0, y * t + 0.5);
        ctx.lineTo(w, y * t + 0.5);
      }
      ctx.stroke();
      ctx.strokeStyle = cssVar(el, '--nc-sky');
      ctx.globalAlpha = 0.28;
      ctx.beginPath();
      for (let x = 8; x < this.mapW(); x += 8) {
        ctx.moveTo(x * t + 0.5, 0);
        ctx.lineTo(x * t + 0.5, h);
      }
      for (let y = 8; y < this.mapH(); y += 8) {
        ctx.moveTo(0, y * t + 0.5);
        ctx.lineTo(w, y * t + 0.5);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  /** Draws a rectangle of tiles at an offset, from the same sheet the map is drawn from. */
  private drawTiles(
    ctx: CanvasRenderingContext2D,
    rect: TileRect,
    cells: Uint8Array,
    off: Pt,
    t: number,
  ): void {
    const atlas = this.atlas();
    for (let y = 0; y < rect.h; y++)
      for (let x = 0; x < rect.w; x++) {
        const spr = cells[y * rect.w + x] ?? 0;
        if (!spr) continue;
        const o = atlas.sourceOf(spr);
        if (!o) continue;
        ctx.drawImage(
          o.canvas,
          o.x,
          o.y,
          SPRITE_SIZE,
          SPRITE_SIZE,
          (rect.x + x + off.x) * t,
          (rect.y + y + off.y) * t,
          t,
          t,
        );
      }
  }

  private drawOverlay(): void {
    const el = this.overlay().nativeElement;
    const ctx = el.getContext('2d');
    if (!ctx) return;
    const t = this.tilePx();
    ctx.clearRect(0, 0, this.cssW(), this.cssH());

    const sel = this.selection();
    if (sel) {
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = cssVar(el, '--nc-ink');
      ctx.strokeRect(sel.x * t + 0.5, sel.y * t + 0.5, sel.w * t - 1, sel.h * t - 1);
      ctx.setLineDash([]);
    }
    // Over the map, not into it: what a layer covers is still there, and still there if it moves on.
    const carried = this.drag?.carrying === true ? this.moveOffset() : null;
    const layer = this.floating();
    if (layer) {
      this.drawTiles(ctx, layer.rect, layer.cells, carried ?? { x: 0, y: 0 }, t);
    }
    const lifted = this.drag?.lifted;
    const off = this.moveOffset();
    if (lifted && off) {
      // Blank where they were, so a move reads as a move rather than a copy.
      ctx.fillStyle = cssVar(el, '--nc-inset');
      ctx.fillRect(lifted.rect.x * t, lifted.rect.y * t, lifted.rect.w * t, lifted.rect.h * t);
      this.drawTiles(ctx, lifted.rect, lifted.cells, off, t);
    }

    const h = this.hoverCell();
    if (h) {
      const stamps = this.tool() === 'stamp' || this.tool() === 'erase';
      const b = this.brush();
      const w = stamps ? b.w : 1;
      const bh = stamps ? b.h : 1;
      ctx.strokeStyle = cssVar(el, '--nc-ink');
      ctx.lineWidth = 2;
      ctx.strokeRect(h.x * t + 1, h.y * t + 1, w * t - 2, bh * t - 2);
      ctx.lineWidth = 1;
    }
  }
}
