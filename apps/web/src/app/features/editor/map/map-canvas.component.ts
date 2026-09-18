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
import { collectionsSignal } from '@app/shared/pixel/collections.signal';
import { geometrySignal } from '@app/shared/pixel/geometry.signal';
import {
  cssVar,
  floodFill,
  linePoints,
  type Pt,
  type Transform,
  transformBlock,
} from '@app/shared/pixel/pixel-tools';
import { type SheetAtlas } from '@app/shared/pixel/sheet-atlas';
import { type SheetPainter } from '@app/shared/pixel/sheet-painter';
import { FIRST_MAP_ID, type Game, type GameMap, SPRITE_SIZE } from '@naucto/engine';
import {
  DragPanDirective,
  FLAG_ACCENTS,
  PresenceLayerComponent,
  type PresenceMark,
  type PresenceViewport,
} from '@naucto/ui';
import type * as Y from 'yjs';

import { type TileClip } from '../state/clipboard.store';
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

/** Every eighth grid line is the bold one, in the sky colour; the design draws the fine ones at 6%. */
const GRID_BOLD_EVERY = 8;
const GRID_FINE_ALPHA = 0.06;
const GRID_BOLD_ALPHA = 0.28;

/**
 * What painting any number of cells needs, read once rather than once per cell: a token is a
 * `getComputedStyle`, which settles pending style work before it answers.
 */
interface Paint {
  ctx: CanvasRenderingContext2D;
  /** Drawn pixels per tile. */
  t: number;
  map: GameMap;
  game: Game;
  atlas: SheetAtlas;
  inset: string;
  ink: string;
  sky: string;
  /** One per flag bit, or null when flags are not shown. */
  flagColours: string[] | null;
}

/** Whether a tile sits inside a rectangle of tiles. */
function withinRect(r: TileRect, p: Pt): boolean {
  return p.x >= r.x && p.y >= r.y && p.x < r.x + r.w && p.y < r.y + r.h;
}

/** The whole tile map in a scrollable surface; stamps tiles from the sheet. */
@Component({
  selector: 'nc-map-canvas',
  imports: [PresenceLayerComponent],
  template: `
    <div #spacer class="relative shrink-0" [style.width.px]="cssW()" [style.height.px]="cssH()">
      <canvas #base class="pixelated absolute" aria-hidden="true"></canvas>
      <canvas
        #overlay
        class="pixelated absolute cursor-crosshair touch-none"
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
  // The spacer is the map's full size and is what the well scrolls over; the canvases are laid at
  // the part of it on screen and sized to that, so the backing store is bounded by the well and
  // not by the map -- see `win`. `shrink-0` is what keeps the spacer that size: a flex item gives
  // way to its container unless told not to, and canvases taken out of the flow no longer hold it
  // open from inside. A map smaller than the viewport is centred rather than pinned to the
  // top-left; `safe` keeps the origin reachable once it is larger.
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
  /** Which of the game's maps is drawn on. The first is what a game has before it adds any. */
  readonly mapId = input(FIRST_MAP_ID);
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

  private readonly spacer = viewChild.required<ElementRef<HTMLDivElement>>('spacer');
  private readonly base = viewChild.required<ElementRef<HTMLCanvasElement>>('base');
  private readonly overlay = viewChild.required<ElementRef<HTMLCanvasElement>>('overlay');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly theme = inject(ThemeService);
  /**
   * The part of the map the canvases hold, in drawn pixels: what the well shows, and no more.
   *
   * Written by `measure` and applied by `place`, in the same frame as the paint that follows: a
   * canvas is cleared by a change of size, so a size bound in the template would land a tick
   * apart from the pixels drawn for it. A map the well contains whole gets the map itself.
   */
  private win = { x: 0, y: 0, w: 0, h: 0 };
  /** Cells to repaint on the next frame, or null when every cell in the window is. */
  private dirty: Set<number> | null = null;
  private readonly hoverCell = signal<Pt | null>(null);
  private drag: {
    start: Pt;
    last: Pt;
    erase: boolean;
    /** MOVE: the tiles taken off the map, and where they were. */
    lifted?: { rect: TileRect; cells: Uint16Array };
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
  private readonly floating = signal<{ rect: TileRect; cells: Uint16Array } | null>(null);
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
  private readonly collections = collectionsSignal(this.game);
  /** The map in hand, or the first when the one asked for is gone -- a deleted map's id lingers. */
  protected readonly gameMap = computed(() => {
    this.collections();
    this.geometry();
    const maps = this.game().maps;

    return maps.find((m) => m.id === this.mapId()) ?? maps[0];
  });
  protected readonly mapW = computed(() => this.gameMap()?.width ?? 0);
  protected readonly mapH = computed(() => this.gameMap()?.height ?? 0);
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
      const unsub = this.game().onTilesChange((changes) => {
        const map = this.gameMap();
        if (!map) return;
        let any = false;
        for (const c of changes) {
          if (c.map !== map.id) continue;
          this.dirty?.add(c.y * map.width + c.x);
          any = true;
        }
        if (any) this.requestBase();
      });
      onCleanup(unsub);
    });
    const el = this.host.nativeElement;
    const onScroll = (): void => {
      if (this.measure()) this.requestBase();
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
      this.gameMap();
      this.grid();
      this.flags();
      this.zoom();
      // Colours come from CSS custom properties read at paint time, so a theme flip has to repaint.
      this.theme.effective();
      untracked(() => {
        this.dirty = null;
        this.requestBase();
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

  /** The tiles under a rectangle, row-major, as the map holds them now. */
  private lift(map: GameMap, rect: TileRect): Uint16Array {
    const cells = new Uint16Array(rect.w * rect.h);
    for (let y = 0; y < rect.h; y++)
      for (let x = 0; x < rect.w; x++) cells[y * rect.w + x] = map.getTile(rect.x + x, rect.y + y);
    return cells;
  }

  /** Nothing selected is nothing to copy: a map has no region in hand to fall back on. */
  copySelection(): TileClip | null {
    const sel = this.selection();
    if (!sel) return null;
    const map = this.gameMap();
    if (!map) return null;
    return { kind: 'tiles', w: sel.w, h: sel.h, cells: this.lift(map, sel) };
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
  pasteClip(clip: TileClip): void {
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
   * Measured off the spacer, exactly as a pointer is: the well centres content smaller than
   * itself, so its scroll offset is not the map's origin and reading one for the other puts the
   * answer a screenful out.
   */
  private visibleCentre(): { x: number; y: number } {
    const well = this.host.nativeElement;
    const box = well.getBoundingClientRect();
    const canvas = this.spacer().nativeElement.getBoundingClientRect();
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
    const map = this.gameMap();
    if (!map) return;
    this.undo()?.stopCapturing();
    this.game().transact(() => {
      for (let y = 0; y < rect.h; y++)
        for (let x = 0; x < rect.w; x++) {
          const tx = rect.x + x;
          const ty = rect.y + y;
          if (tx < map.width && ty < map.height) map.setTile(tx, ty, cells[y * rect.w + x] ?? 0);
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
    const map = this.gameMap();
    if (!sel || !map) return;
    this.game().transact(() => {
      for (let y = sel.y; y < sel.y + sel.h; y++)
        for (let x = sel.x; x < sel.x + sel.w; x++) map.setTile(x, y, 0);
    });
  }

  /**
   * Turns the selected tiles over in place, as one undo step.
   *
   * It is the arrangement that turns: each tile changes place and keeps its own picture, since a
   * tile is a sprite number and the sheet has no mirrored copy to point it at. A rotation swaps the
   * selection's sides, and the turned block is kept whole and on the map -- the rule a paste
   * follows -- so it slides away from an edge rather than losing what would land past it.
   */
  transformSelection(op: Transform): void {
    // Done with the layer, as any other edit is: the turn reads the map, and a placed paste is not
    // in it until it is settled.
    this.settleFloating();
    const sel = this.selection();
    const map = this.gameMap();
    if (!sel || !map) return;
    const out = transformBlock({ cells: this.lift(map, sel), w: sel.w, h: sel.h }, op);
    const rect = this.clampToMap({ x: sel.x, y: sel.y, w: out.w, h: out.h });
    this.undo()?.stopCapturing();
    this.game().transact(() => {
      for (let y = 0; y < sel.h; y++)
        for (let x = 0; x < sel.w; x++) map.setTile(sel.x + x, sel.y + y, 0);
      for (let y = 0; y < rect.h; y++)
        for (let x = 0; x < rect.w; x++) {
          const tx = rect.x + x;
          const ty = rect.y + y;
          if (tx < map.width && ty < map.height) map.setTile(tx, ty, out.cells[y * out.w + x] ?? 0);
        }
    });
    this.undo()?.stopCapturing();
    this.selection.set(rect);
  }

  /**
   * Reads where the well is over the map, and says whether the window moved.
   *
   * Moved, every cell in it is to be painted again, and the overlay -- laid at the same window --
   * along with it; the base layer is the caller's to request, because the frame that paints it
   * measures first and would otherwise ask for a second one.
   */
  private measure(): boolean {
    const el = this.host.nativeElement;
    const t = this.tilePx();
    this.viewPx.set({ x: el.scrollLeft, y: el.scrollTop, w: el.clientWidth, h: el.clientHeight });
    this.viewport.emit({
      x: el.scrollLeft / t,
      y: el.scrollTop / t,
      w: el.clientWidth / t,
      h: el.clientHeight / t,
    });
    const cssW = this.cssW();
    const cssH = this.cssH();
    // One pixel over: a scroll offset is not always whole, and the window starts on the whole
    // pixel below it.
    const w = Math.min(cssW, el.clientWidth + 1);
    const h = Math.min(cssH, el.clientHeight + 1);
    const x = Math.max(0, Math.min(Math.floor(el.scrollLeft), cssW - w));
    const y = Math.max(0, Math.min(Math.floor(el.scrollTop), cssH - h));
    const was = this.win;
    if (was.x === x && was.y === y && was.w === w && was.h === h) return false;
    this.win = { x, y, w, h };
    this.dirty = null;
    this.requestOverlay();
    return true;
  }

  // ---- pointer --------------------------------------------------------------

  private cellOf(e: PointerEvent): Pt {
    const p = this.pointOf(e);
    return {
      x: Math.max(0, Math.min(this.mapW() - 1, Math.floor(p.x))),
      y: Math.max(0, Math.min(this.mapH() - 1, Math.floor(p.y))),
    };
  }

  /** The same position, unsnapped — see `pointer`. Off the spacer: the canvases cover a window of it. */
  private pointOf(e: PointerEvent): { x: number; y: number } {
    const r = this.spacer().nativeElement.getBoundingClientRect();
    const t = this.tilePx();
    return { x: (e.clientX - r.left) / t, y: (e.clientY - r.top) / t };
  }

  private stamp(cell: Pt, erase: boolean): void {
    const b = this.brush();
    this.game().transact(() => {
      const sheet = this.sheet();
      const map = this.gameMap();
      if (!sheet || !map) return;
      for (let j = 0; j < b.h; j++)
        for (let i = 0; i < b.w; i++) {
          // Through the sheet the brush was picked from: a cell of it is only a sprite number once
          // the sheet's own width and its place in the run of them are both taken into account.
          const spr = erase ? 0 : sheet.base + (b.y + j) * sheet.cols + b.x + i;
          if (spr < sheet.base + sheet.count) map.setTile(cell.x + i, cell.y + j, spr);
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
        const map = this.gameMap();
        const sheet = this.sheet();
        if (!sheet || !map) return;
        const tiles = map.tiles;
        const pts = floodFill((x, y) => tiles[y * map.width + x] ?? 0, cell, map.width, map.height);
        const spr = erase ? 0 : sheet.base + this.brush().y * sheet.cols + this.brush().x;
        this.game().transact(() => {
          for (const p of pts) map.setTile(p.x, p.y, spr);
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
        const map = this.gameMap();
        if (!map) {
          this.drag = null;
          break;
        }
        this.drag.lifted = { rect, cells: this.lift(map, rect) };
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
    const map = this.gameMap();
    if (!map) return;
    this.game().transact(() => {
      for (let y = 0; y < rect.h; y++)
        for (let x = 0; x < rect.w; x++) map.setTile(rect.x + x, rect.y + y, 0);
      for (let y = 0; y < rect.h; y++)
        for (let x = 0; x < rect.w; x++) {
          const tx = rect.x + x + off.x;
          const ty = rect.y + y + off.y;
          if (tx >= 0 && ty >= 0 && tx < map.width && ty < map.height)
            map.setTile(tx, ty, cells[y * rect.w + x] ?? 0);
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
      this.measure();
      const cells = this.dirty;
      this.dirty = new Set();
      if (cells) this.paintTiles(cells);
      else this.drawBase();
    });
  }

  private requestOverlay(): void {
    cancelAnimationFrame(this.rafOverlay);
    this.rafOverlay = requestAnimationFrame(() => {
      this.drawOverlay();
    });
  }

  /** Lays a canvas at the window. A size is written only when it changed: writing one clears it. */
  private place(el: HTMLCanvasElement): void {
    const { x, y, w, h } = this.win;
    if (el.width !== w) el.width = w;
    if (el.height !== h) el.height = h;
    el.style.left = `${String(x)}px`;
    el.style.top = `${String(y)}px`;
  }

  private paintOf(ctx: CanvasRenderingContext2D, map: GameMap): Paint {
    const style = getComputedStyle(ctx.canvas);
    const token = (name: string): string => style.getPropertyValue(name).trim();
    return {
      ctx,
      t: this.tilePx(),
      map,
      game: this.game(),
      atlas: this.atlas(),
      inset: token('--nc-inset'),
      ink: token('--nc-ink'),
      sky: token('--nc-sky'),
      flagColours: this.flags() ? FLAG_VARS.map(token) : null,
    };
  }

  /**
   * One cell, in map pixels: its floor, its sprite, the tint of its flag. Painted onto the floor
   * rather than over what was there, so a cell whose tile went is blank again.
   */
  private paintTile(p: Paint, x: number, y: number): void {
    const { ctx, t } = p;
    const px = x * t;
    const py = y * t;
    ctx.fillStyle = p.inset;
    ctx.fillRect(px, py, t, t);
    const spr = p.map.tiles[y * p.map.width + x] ?? 0;
    if (!spr) return;
    // Through the sheet that answers to this number: a map mixes them freely, and read off one
    // sheet a tile from another lands on whatever pixels happen to sit at that offset.
    const o = p.atlas.sourceOf(spr);
    if (!o) return;
    ctx.drawImage(o.canvas, o.x, o.y, SPRITE_SIZE, SPRITE_SIZE, px, py, t, t);
    if (!p.flagColours) return;
    const f = p.game.getFlag(spr);
    if (!f) return;
    const bit = Math.log2(f & -f);
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = p.flagColours[bit] ?? '#fff';
    ctx.fillRect(px, py, t, t);
    ctx.globalAlpha = 1;
  }

  /**
   * The cells changed since the last frame, and only those.
   *
   * Each also gets its own two grid lines back, the one on its left and the one on its top: a
   * line at n·t + 0.5 lies in the first pixel column of cell n, so no cell paints over another's.
   * Fine lines in one stroke and bold in another, in that order, as the full draw layers them --
   * a pixel two lines cross is composited once per stroke, and the count has to agree.
   */
  private paintTiles(cells: Set<number>): void {
    const el = this.base().nativeElement;
    const ctx = el.getContext('2d');
    const map = this.gameMap();
    if (!ctx || !map) return;
    const win = this.win;
    const p = this.paintOf(ctx, map);
    const t = p.t;
    const x0 = Math.floor(win.x / t);
    const y0 = Math.floor(win.y / t);
    const x1 = Math.min(map.width, Math.ceil((win.x + win.w) / t));
    const y1 = Math.min(map.height, Math.ceil((win.y + win.h) / t));
    ctx.setTransform(1, 0, 0, 1, -win.x, -win.y);
    ctx.imageSmoothingEnabled = false;
    const grid = this.grid();
    for (const i of cells) {
      const x = i % map.width;
      const y = (i - x) / map.width;
      if (x < x0 || x >= x1 || y < y0 || y >= y1) continue;
      this.paintTile(p, x, y);
      if (!grid) continue;
      const px = x * t;
      const py = y * t;
      for (const bold of [false, true]) {
        ctx.beginPath();
        if (x > 0 && (x % GRID_BOLD_EVERY === 0) === bold) {
          ctx.moveTo(px + 0.5, py);
          ctx.lineTo(px + 0.5, py + t);
        }
        if (y > 0 && (y % GRID_BOLD_EVERY === 0) === bold) {
          ctx.moveTo(px, py + 0.5);
          ctx.lineTo(px + t, py + 0.5);
        }
        ctx.strokeStyle = bold ? p.sky : p.ink;
        ctx.globalAlpha = bold ? GRID_BOLD_ALPHA : GRID_FINE_ALPHA;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }

  /** Every cell in the window, then the grid over them as lines the length of the window. */
  private drawBase(): void {
    const el = this.base().nativeElement;
    this.place(el);
    const ctx = el.getContext('2d');
    if (!ctx) return;
    const win = this.win;
    // Everything below draws in map pixels; the window moves the origin and nothing else.
    ctx.setTransform(1, 0, 0, 1, -win.x, -win.y);
    ctx.imageSmoothingEnabled = false;
    const map = this.gameMap();
    if (!map) {
      ctx.fillStyle = cssVar(el, '--nc-inset');
      ctx.fillRect(win.x, win.y, win.w, win.h);
      return;
    }
    const p = this.paintOf(ctx, map);
    const t = p.t;
    const x0 = Math.floor(win.x / t);
    const y0 = Math.floor(win.y / t);
    const x1 = Math.min(map.width, Math.ceil((win.x + win.w) / t));
    const y1 = Math.min(map.height, Math.ceil((win.y + win.h) / t));
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) this.paintTile(p, x, y);
    if (this.grid()) {
      const left = win.x;
      const right = win.x + win.w;
      const top = win.y;
      const bottom = win.y + win.h;
      ctx.globalAlpha = GRID_FINE_ALPHA;
      ctx.strokeStyle = p.ink;
      ctx.beginPath();
      for (let x = Math.max(1, x0); x < x1; x++) {
        if (x % GRID_BOLD_EVERY === 0) continue;
        ctx.moveTo(x * t + 0.5, top);
        ctx.lineTo(x * t + 0.5, bottom);
      }
      for (let y = Math.max(1, y0); y < y1; y++) {
        if (y % GRID_BOLD_EVERY === 0) continue;
        ctx.moveTo(left, y * t + 0.5);
        ctx.lineTo(right, y * t + 0.5);
      }
      ctx.stroke();
      ctx.strokeStyle = p.sky;
      ctx.globalAlpha = GRID_BOLD_ALPHA;
      ctx.beginPath();
      for (let x = Math.max(1, x0); x < x1; x++) {
        if (x % GRID_BOLD_EVERY !== 0) continue;
        ctx.moveTo(x * t + 0.5, top);
        ctx.lineTo(x * t + 0.5, bottom);
      }
      for (let y = Math.max(1, y0); y < y1; y++) {
        if (y % GRID_BOLD_EVERY !== 0) continue;
        ctx.moveTo(left, y * t + 0.5);
        ctx.lineTo(right, y * t + 0.5);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  /** Draws a rectangle of tiles at an offset, from the same sheet the map is drawn from. */
  private drawTiles(
    ctx: CanvasRenderingContext2D,
    rect: TileRect,
    cells: Uint16Array,
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
    this.place(el);
    const ctx = el.getContext('2d');
    if (!ctx) return;
    const t = this.tilePx();
    const win = this.win;
    ctx.setTransform(1, 0, 0, 1, -win.x, -win.y);
    ctx.clearRect(win.x, win.y, win.w, win.h);

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
