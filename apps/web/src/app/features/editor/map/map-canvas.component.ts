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
import {
  type EditableGame,
  FIRST_MAP_ID,
  type Game,
  type GameMap,
  SPRITE_SIZE,
} from '@naucto/engine';
import {
  DragPanDirective,
  FLAG_ACCENTS,
  PresenceLayerComponent,
  type PresenceMark,
  type PresenceViewport,
} from '@naucto/ui';
import type * as Y from 'yjs';

import { ThemeService } from '../../../core/theme/theme.service';
import {
  FLAG_TINT_ALPHA,
  MAP_GRID,
  MARK_LINE_WIDTH,
  outlineCells,
} from '../../../shared/pixel/canvas-style';
import { collectionsSignal } from '../../../shared/pixel/collections.signal';
import { FloatingLayer, slideInside } from '../../../shared/pixel/floating-layer';
import { geometrySignal } from '../../../shared/pixel/geometry.signal';
import {
  cssVar,
  floodFill,
  linePoints,
  type Pt,
  spanning,
  type Transform,
  withinBounds,
} from '../../../shared/pixel/pixel-tools';
import { type SheetAtlas } from '../../../shared/pixel/sheet-atlas';
import { type SheetPainter } from '../../../shared/pixel/sheet-painter';
import { type TileClip } from '../state/clipboard.store';
import { type Collaborator } from '../work-session/session-presence.service';
import { type MapTool, type TileRect } from './map.store';

export interface TileViewport {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The chips that set these bits carry the same eight, so a marked tile and its flag agree. */
const FLAG_VARS = FLAG_ACCENTS.map((accent) => `--nc-${accent}`);

/** How much of a well the canvases hold beyond it on each side; see `win`. */
const WINDOW_SLACK = 0.5;

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

/** The whole tile map in a scrollable well; stamps tiles from the sheet. The canvases hold only a
 * window of the map — the well plus a margin on every side — so the backing store is bounded by
 * the well and a pan scrolls over pixels already painted; the window is resized in the frame that
 * paints it, because a change of size clears a canvas. */
@Component({
  selector: 'nc-map-canvas',
  imports: [PresenceLayerComponent],
  templateUrl: './map-canvas.component.html',
  hostDirectives: [DragPanDirective],
  // The wheel is bound on the well rather than on the canvas, so it is answered over the gutter a
  // map smaller than the well is centred in.
  // `safe` centring keeps the origin reachable once the map is larger than the well.
  host: {
    class: 'flex overflow-auto [align-items:safe_center] [justify-content:safe_center]',
    tabindex: '0',
    '(wheel)': 'onWheel($event)',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapCanvasComponent {
  readonly game = input.required<EditableGame>();
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
  /** The window the canvases hold, in drawn pixels; a map the well contains whole gets the map
   * itself. */
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
   * A pasted clip, placed but not written. A selection turned against an edge is slid back onto the
   * map whole rather than losing what would land past it.
   */
  private readonly floating = new FloatingLayer<Uint16Array>(
    {
      read: (x, y) => this.gameMap()?.getTile(x, y) ?? 0,
      write: (x, y, value) => {
        this.gameMap()?.setTile(x, y, value);
      },
      bounds: () => this.mapBounds(),
      transact: (edit) => {
        this.game().transact(edit);
      },
      undo: () => this.undo(),
    },
    Uint16Array,
    'slide',
  );
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

    return maps.find((map) => map.id === this.mapId()) ?? maps[0];
  });
  protected readonly mapW = computed(() => this.gameMap()?.width ?? 0);
  protected readonly mapH = computed(() => this.gameMap()?.height ?? 0);
  private readonly mapBounds = computed(() => ({ x: 0, y: 0, w: this.mapW(), h: this.mapH() }));
  protected readonly cssW = computed(() => this.mapW() * this.tilePx());
  protected readonly cssH = computed(() => this.mapH() * this.tilePx());
  protected readonly marks = computed<PresenceMark[]>(() => {
    const tileSize = this.tilePx();
    return this.collaborators()
      .filter((collaborator) => !collaborator.isSelf && collaborator.cursor?.tab === 'map')
      .map((collaborator) => ({
        id: collaborator.clientId,
        name: collaborator.name,
        colour: collaborator.colour,
        x: (collaborator.cursor?.x ?? 0) * tileSize,
        y: (collaborator.cursor?.y ?? 0) * tileSize,
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
        if (!map) {
          return;
        }
        let any = false;
        for (const change of changes) {
          if (change.map !== map.id) {
            continue;
          }
          this.dirty?.add(change.y * map.width + change.x);
          any = true;
        }
        if (any) {
          this.requestBase();
        }
      });
      onCleanup(unsub);
    });
    const el = this.host.nativeElement;
    const onScroll = (): void => {
      if (this.measure()) {
        this.requestBase();
      }
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
      this.floating.placed();
      this.moveOffset();
      this.theme.effective();
      untracked(() => {
        this.requestOverlay();
      });
    });
    // A placed paste settles when the tool stops being the one that moves it; untracked, so placing
    // one does not settle it.
    effect(() => {
      const movable = this.tool() === 'move';
      untracked(() => {
        if (!movable) {
          this.settleFloating();
        }
      });
    });
  }

  /** Scrolling is the wheel's; zooming asks for the modifier the browser reserves for it. */
  protected onWheel(event: WheelEvent): void {
    if (!event.ctrlKey && !event.metaKey) {
      return;
    }
    event.preventDefault();
    this.zoomBy.emit(event.deltaY < 0 ? 1 : -1);
  }

  /**
   * Puts back in the middle of the well whatever was there at the previous scale.
   *
   * The map scales about its own origin, so offsets left alone hold the top-left corner and nothing
   * else. Below the well's size the host centres the map itself, and there is nothing to hold.
   */
  private holdCentre(): void {
    const tileSize = this.tilePx();
    const was = this.lastTilePx;
    this.lastTilePx = tileSize;
    if (!was || was === tileSize) {
      return;
    }
    const el = this.host.nativeElement;
    if (el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight) {
      return;
    }
    const x = (el.scrollLeft + el.clientWidth / 2) / was;
    const y = (el.scrollTop + el.clientHeight / 2) / was;
    el.scrollLeft = x * tileSize - el.clientWidth / 2;
    el.scrollTop = y * tileSize - el.clientHeight / 2;
  }

  /**
   * Scrolls so the given tile is centred, at once: a smooth scroll restarted on every move of a
   * drag never arrives.
   */
  scrollToTile(x: number, y: number): void {
    const el = this.host.nativeElement;
    const tileSize = this.tilePx();
    el.scrollTo({
      left: x * tileSize - el.clientWidth / 2,
      top: y * tileSize - el.clientHeight / 2,
    });
  }

  /** Nothing selected is nothing to copy: a map has no region in hand to fall back on. */
  copySelection(): TileClip | null {
    const sel = this.selection();
    if (!sel) {
      return null;
    }
    if (!this.gameMap()) {
      return null;
    }
    return { kind: 'tiles', w: sel.w, h: sel.h, cells: this.floating.lift(sel) };
  }

  /**
   * The tile in the middle of what is on screen, measured off the spacer as a pointer is: the well
   * centres content smaller than itself, so its scroll offset is not the map's origin.
   */
  private visibleCentre(): { x: number; y: number } {
    const well = this.host.nativeElement;
    const box = well.getBoundingClientRect();
    const canvas = this.spacer().nativeElement.getBoundingClientRect();
    const tileSize = this.tilePx();
    return {
      x: (box.left + well.clientWidth / 2 - canvas.left) / tileSize,
      y: (box.top + well.clientHeight / 2 - canvas.top) / tileSize,
    };
  }

  /** Writes the placed layer into the map, as one undo step. Silent when there is none. */
  settleFloating(): void {
    const rect = this.floating.settle();
    if (rect) {
      this.selection.set(rect);
    }
  }

  /**
   * Places the clip as a floating layer in the middle of what is on screen, kept whole on the map;
   * nothing is written until it is settled.
   */
  pasteClip(clip: TileClip): void {
    // A second paste settles the first rather than dropping it: work already placed is work.
    this.settleFloating();
    const centre = this.visibleCentre();
    const rect = this.floating.place(
      {
        x: Math.round(centre.x - clip.w / 2),
        y: Math.round(centre.y - clip.h / 2),
        w: clip.w,
        h: clip.h,
      },
      clip.cells,
    );
    this.selection.set(rect);
    this.pasted.emit();
  }

  /** Drops the placed layer. Nothing was written, so there is nothing to undo. */
  discardFloating(): boolean {
    return this.floating.discard();
  }

  /** Clears the selected tiles (Delete / Backspace). */
  clearSelection(): void {
    const sel = this.selection();
    const map = this.gameMap();
    if (!sel || !map) {
      return;
    }
    this.game().transact(() => {
      for (let y = sel.y; y < sel.y + sel.h; y++) {
        for (let x = sel.x; x < sel.x + sel.w; x++) {
          map.setTile(x, y, 0);
        }
      }
    });
  }

  /**
   * Turns the selected tiles over in place, as one undo step.
   *
   * It is the arrangement that turns: each tile changes place and keeps its own picture, since a
   * tile is a sprite number and the sheet has no mirrored copy to point it at. A rotation swaps the
   * selection's sides; turned against an edge, it slides away from it.
   */
  transformSelection(op: Transform): void {
    // Done with the layer, as any other edit is: the turn reads the map, and a placed paste is not
    // in it until it is settled.
    this.settleFloating();
    const sel = this.selection();
    if (!sel || !this.gameMap()) {
      return;
    }
    this.selection.set(this.floating.transform(sel, op));
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
    const tileSize = this.tilePx();
    const sx = el.scrollLeft;
    const sy = el.scrollTop;
    const vw = el.clientWidth;
    const vh = el.clientHeight;
    this.viewPx.set({ x: sx, y: sy, w: vw, h: vh });
    this.viewport.emit({
      x: sx / tileSize,
      y: sy / tileSize,
      w: vw / tileSize,
      h: vh / tileSize,
    });
    const cssW = this.cssW();
    const cssH = this.cssH();
    // One pixel over: a scroll offset is not always whole, and the window starts on the whole
    // pixel below it.
    const width = Math.min(cssW, Math.ceil(vw * (1 + 2 * WINDOW_SLACK)) + 1);
    const height = Math.min(cssH, Math.ceil(vh * (1 + 2 * WINDOW_SLACK)) + 1);
    const was = this.win;
    // Settled while the view keeps a quarter of a well between itself and every edge of the
    // window that is not also an edge of the map. Tested on the window there is rather than on
    // the one there would be: near the map's edge the two drift apart while the view is still
    // covered, and past it the ideal window stops moving while the view goes on.
    const gx = (vw * WINDOW_SLACK) / 2;
    const gy = (vh * WINDOW_SLACK) / 2;
    if (
      was.w === width &&
      was.h === height &&
      (was.x === 0 || sx >= was.x + gx) &&
      (was.x + width >= cssW || sx + vw <= was.x + width - gx) &&
      (was.y === 0 || sy >= was.y + gy) &&
      (was.y + height >= cssH || sy + vh <= was.y + height - gy)
    ) {
      return false;
    }
    const x = Math.max(0, Math.min(Math.floor(sx - vw * WINDOW_SLACK), cssW - width));
    const y = Math.max(0, Math.min(Math.floor(sy - vh * WINDOW_SLACK), cssH - height));
    if (was.x === x && was.y === y && was.w === width && was.h === height) {
      return false;
    }
    this.win = { x, y, w: width, h: height };
    this.dirty = null;
    this.requestOverlay();
    return true;
  }

  /** The same position, unsnapped — see `pointer`. Off the spacer: the canvases cover a window of it. */
  private pointOf(event: PointerEvent): { x: number; y: number } {
    const box = this.spacer().nativeElement.getBoundingClientRect();
    const tileSize = this.tilePx();
    return { x: (event.clientX - box.left) / tileSize, y: (event.clientY - box.top) / tileSize };
  }

  private cellOf(event: PointerEvent): Pt {
    const point = this.pointOf(event);
    return {
      x: Math.max(0, Math.min(this.mapW() - 1, Math.floor(point.x))),
      y: Math.max(0, Math.min(this.mapH() - 1, Math.floor(point.y))),
    };
  }

  private stamp(cell: Pt, erase: boolean): void {
    const brush = this.brush();
    this.game().transact(() => {
      const sheet = this.sheet();
      const map = this.gameMap();
      if (!sheet || !map) {
        return;
      }
      for (let j = 0; j < brush.h; j++) {
        for (let i = 0; i < brush.w; i++) {
          // Through the sheet the brush was picked from: a cell of it is only a sprite number once
          // the sheet's own width and its place in the run of them are both taken into account.
          const spr = erase ? 0 : sheet.base + (brush.y + j) * sheet.cols + brush.x + i;
          if (spr < sheet.base + sheet.count) {
            map.setTile(cell.x + i, cell.y + j, spr);
          }
        }
      }
    });
  }

  protected onDown(event: PointerEvent): void {
    if (event.button !== 0 && event.button !== 2) {
      return;
    }
    this.host.nativeElement.focus({ preventScroll: true });
    this.overlay().nativeElement.setPointerCapture(event.pointerId);
    const cell = this.cellOf(event);
    const erase = event.button === 2 || this.tool() === 'erase';
    const layer = this.floating.placed();
    if (layer && this.tool() === 'move' && withinBounds(layer.rect, cell)) {
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
        if (!sheet || !map) {
          return;
        }
        const tiles = map.tiles;
        const pts = floodFill((x, y) => tiles[y * map.width + x] ?? 0, cell, map.width, map.height);
        const spr = erase ? 0 : sheet.base + this.brush().y * sheet.cols + this.brush().x;
        this.game().transact(() => {
          for (const point of pts) {
            map.setTile(point.x, point.y, spr);
          }
        });
        this.drag = null;
        break;
      }
      case 'select':
        this.selection.set(null);
        break;
      case 'move': {
        const rect = this.selection();
        if (!rect || !withinBounds(rect, cell)) {
          this.drag = null;
          break;
        }
        if (!this.gameMap()) {
          this.drag = null;
          break;
        }
        this.drag.lifted = { rect, cells: this.floating.lift(rect) };
        this.moveOffset.set({ x: 0, y: 0 });
        break;
      }
    }
  }

  protected onMove(event: PointerEvent): void {
    const cell = this.cellOf(event);
    this.hoverCell.set(cell);
    this.hover.emit(cell);
    this.pointer.emit(this.pointOf(event));
    const drag = this.drag;
    if (!drag || (cell.x === drag.last.x && cell.y === drag.last.y)) {
      return;
    }
    if (this.tool() === 'stamp' || this.tool() === 'erase') {
      for (const point of linePoints(drag.last, cell)) {
        this.stamp(point, drag.erase);
      }
    } else if (drag.carrying === true || drag.lifted) {
      this.moveOffset.set({ x: cell.x - drag.start.x, y: cell.y - drag.start.y });
    } else if (this.tool() === 'select') {
      this.selection.set(spanning(drag.start, cell));
    }
    drag.last = cell;
  }

  protected onUp(): void {
    const drag = this.drag;
    this.drag = null;
    const off = this.moveOffset();
    this.moveOffset.set(null);
    if (!drag || !off) {
      return;
    }
    if (drag.carrying === true) {
      const rect = this.floating.carry(off);
      if (rect) {
        this.selection.set(rect);
      }
      return;
    }
    if (!drag.lifted || (off.x === 0 && off.y === 0)) {
      return;
    }
    const { rect, cells } = drag.lifted;
    if (!this.gameMap()) {
      return;
    }
    this.floating.move(rect, cells, off);
    this.selection.set(
      slideInside({ ...rect, x: rect.x + off.x, y: rect.y + off.y }, this.mapBounds()),
    );
  }

  protected onLeave(): void {
    this.hoverCell.set(null);
    this.hover.emit(null);
    this.pointer.emit(null);
  }

  // ---- drawing --------------------------------------------------------------

  /** Lays a canvas at the window. A size is written only when it changed: writing one clears it. */
  private place(el: HTMLCanvasElement): void {
    const { x, y, w, h } = this.win;
    if (el.width !== w) {
      el.width = w;
    }
    if (el.height !== h) {
      el.height = h;
    }
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
  private paintTile(paint: Paint, x: number, y: number): void {
    const { ctx, t } = paint;
    const px = x * t;
    const py = y * t;
    ctx.fillStyle = paint.inset;
    ctx.fillRect(px, py, t, t);
    const spr = paint.map.tiles[y * paint.map.width + x] ?? 0;
    if (!spr) {
      return;
    }
    // Through the sheet that answers to this number: a map mixes them freely, and read off one
    // sheet a tile from another lands on whatever pixels happen to sit at that offset.
    const source = paint.atlas.sourceOf(spr);
    if (!source) {
      return;
    }
    ctx.drawImage(source.canvas, source.x, source.y, SPRITE_SIZE, SPRITE_SIZE, px, py, t, t);
    if (!paint.flagColours) {
      return;
    }
    const flagMask = paint.game.sheetOf(spr)?.getFlag(spr) ?? 0;
    if (!flagMask) {
      return;
    }
    const bit = Math.log2(flagMask & -flagMask);
    ctx.globalAlpha = FLAG_TINT_ALPHA;
    ctx.fillStyle = paint.flagColours[bit] ?? '#fff';
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
    if (!ctx || !map) {
      return;
    }
    const win = this.win;
    const paint = this.paintOf(ctx, map);
    const tileSize = paint.t;
    const x0 = Math.floor(win.x / tileSize);
    const y0 = Math.floor(win.y / tileSize);
    const x1 = Math.min(map.width, Math.ceil((win.x + win.w) / tileSize));
    const y1 = Math.min(map.height, Math.ceil((win.y + win.h) / tileSize));
    ctx.setTransform(1, 0, 0, 1, -win.x, -win.y);
    ctx.imageSmoothingEnabled = false;
    const grid = this.grid();
    for (const i of cells) {
      const x = i % map.width;
      const y = (i - x) / map.width;
      if (x < x0 || x >= x1 || y < y0 || y >= y1) {
        continue;
      }
      this.paintTile(paint, x, y);
      if (!grid) {
        continue;
      }
      const px = x * tileSize;
      const py = y * tileSize;
      for (const bold of [false, true]) {
        ctx.beginPath();
        if (x > 0 && (x % MAP_GRID.boldEvery === 0) === bold) {
          ctx.moveTo(px + 0.5, py);
          ctx.lineTo(px + 0.5, py + tileSize);
        }
        if (y > 0 && (y % MAP_GRID.boldEvery === 0) === bold) {
          ctx.moveTo(px, py + 0.5);
          ctx.lineTo(px + tileSize, py + 0.5);
        }
        ctx.strokeStyle = bold ? paint.sky : paint.ink;
        ctx.globalAlpha = bold ? MAP_GRID.boldAlpha : MAP_GRID.fineAlpha;
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
    if (!ctx) {
      return;
    }
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
    const paint = this.paintOf(ctx, map);
    const tileSize = paint.t;
    const x0 = Math.floor(win.x / tileSize);
    const y0 = Math.floor(win.y / tileSize);
    const x1 = Math.min(map.width, Math.ceil((win.x + win.w) / tileSize));
    const y1 = Math.min(map.height, Math.ceil((win.y + win.h) / tileSize));
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        this.paintTile(paint, x, y);
      }
    }
    if (this.grid()) {
      const left = win.x;
      const right = win.x + win.w;
      const top = win.y;
      const bottom = win.y + win.h;
      ctx.globalAlpha = MAP_GRID.fineAlpha;
      ctx.strokeStyle = paint.ink;
      ctx.beginPath();
      for (let x = Math.max(1, x0); x < x1; x++) {
        if (x % MAP_GRID.boldEvery === 0) {
          continue;
        }
        ctx.moveTo(x * tileSize + 0.5, top);
        ctx.lineTo(x * tileSize + 0.5, bottom);
      }
      for (let y = Math.max(1, y0); y < y1; y++) {
        if (y % MAP_GRID.boldEvery === 0) {
          continue;
        }
        ctx.moveTo(left, y * tileSize + 0.5);
        ctx.lineTo(right, y * tileSize + 0.5);
      }
      ctx.stroke();
      ctx.strokeStyle = paint.sky;
      ctx.globalAlpha = MAP_GRID.boldAlpha;
      ctx.beginPath();
      for (let x = Math.max(1, x0); x < x1; x++) {
        if (x % MAP_GRID.boldEvery !== 0) {
          continue;
        }
        ctx.moveTo(x * tileSize + 0.5, top);
        ctx.lineTo(x * tileSize + 0.5, bottom);
      }
      for (let y = Math.max(1, y0); y < y1; y++) {
        if (y % MAP_GRID.boldEvery !== 0) {
          continue;
        }
        ctx.moveTo(left, y * tileSize + 0.5);
        ctx.lineTo(right, y * tileSize + 0.5);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  /** Draws a rectangle of tiles at an offset, each from the sheet its number belongs to. */
  private drawTiles(
    ctx: CanvasRenderingContext2D,
    rect: TileRect,
    cells: Uint16Array,
    off: Pt,
    tileSize: number,
  ): void {
    const atlas = this.atlas();
    for (let y = 0; y < rect.h; y++) {
      for (let x = 0; x < rect.w; x++) {
        const spr = cells[y * rect.w + x] ?? 0;
        if (!spr) {
          continue;
        }
        const source = atlas.sourceOf(spr);
        if (!source) {
          continue;
        }
        ctx.drawImage(
          source.canvas,
          source.x,
          source.y,
          SPRITE_SIZE,
          SPRITE_SIZE,
          (rect.x + x + off.x) * tileSize,
          (rect.y + y + off.y) * tileSize,
          tileSize,
          tileSize,
        );
      }
    }
  }

  private drawOverlay(): void {
    const el = this.overlay().nativeElement;
    this.place(el);
    const ctx = el.getContext('2d');
    if (!ctx) {
      return;
    }
    const tileSize = this.tilePx();
    const win = this.win;
    ctx.setTransform(1, 0, 0, 1, -win.x, -win.y);
    ctx.clearRect(win.x, win.y, win.w, win.h);

    const sel = this.selection();
    if (sel) {
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = cssVar(el, '--nc-ink');
      outlineCells(ctx, sel, tileSize);
      ctx.setLineDash([]);
    }
    // Over the map, not into it: what a layer covers is still there, and still there if it moves on.
    const carried = this.drag?.carrying === true ? this.moveOffset() : null;
    const layer = this.floating.placed();
    if (layer) {
      this.drawTiles(ctx, layer.rect, layer.cells, carried ?? { x: 0, y: 0 }, tileSize);
    }
    const lifted = this.drag?.lifted;
    const off = this.moveOffset();
    if (lifted && off) {
      // Blank where they were, so a move reads as a move rather than a copy.
      ctx.fillStyle = cssVar(el, '--nc-inset');
      ctx.fillRect(
        lifted.rect.x * tileSize,
        lifted.rect.y * tileSize,
        lifted.rect.w * tileSize,
        lifted.rect.h * tileSize,
      );
      this.drawTiles(ctx, lifted.rect, lifted.cells, off, tileSize);
    }

    const hoveredCell = this.hoverCell();
    if (hoveredCell) {
      const stamps = this.tool() === 'stamp' || this.tool() === 'erase';
      const brush = this.brush();
      ctx.strokeStyle = cssVar(el, '--nc-ink');
      outlineCells(
        ctx,
        { ...hoveredCell, w: stamps ? brush.w : 1, h: stamps ? brush.h : 1 },
        tileSize,
        MARK_LINE_WIDTH,
      );
    }
  }

  private requestBase(): void {
    cancelAnimationFrame(this.rafBase);
    this.rafBase = requestAnimationFrame(() => {
      // Inside the frame: the map's size is a template binding, and an offset written before it
      // lands is clamped against the width the element still has.
      this.holdCentre();
      this.measure();
      const cells = this.dirty;
      this.dirty = new Set();
      if (cells) {
        this.paintTiles(cells);
      } else {
        this.drawBase();
      }
    });
  }

  private requestOverlay(): void {
    cancelAnimationFrame(this.rafOverlay);
    this.rafOverlay = requestAnimationFrame(() => {
      this.drawOverlay();
    });
  }
}
