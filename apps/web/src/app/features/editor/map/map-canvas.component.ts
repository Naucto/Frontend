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
import { cssVar, floodFill, linePoints, type Pt } from '@app/shared/pixel/pixel-tools';
import { type SheetPainter } from '@app/shared/pixel/sheet-painter';
import {
  type Game,
  MAP_HEIGHT,
  MAP_WIDTH,
  SPRITE_COUNT,
  SPRITE_SIZE,
  SPRITES_PER_ROW,
} from '@naucto/engine';
import {
  DragPanDirective,
  FLAG_ACCENTS,
  PresenceLayerComponent,
  type PresenceMark,
  type PresenceViewport,
} from '@naucto/ui';

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

/** The whole 128×32 tile map in a scrollable surface; stamps tiles from the sheet. */
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

  private readonly base = viewChild.required<ElementRef<HTMLCanvasElement>>('base');
  private readonly overlay = viewChild.required<ElementRef<HTMLCanvasElement>>('overlay');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly theme = inject(ThemeService);
  private readonly tilesVersion = signal(0);
  private readonly hoverCell = signal<Pt | null>(null);
  private drag: { start: Pt; last: Pt; erase: boolean } | null = null;
  private rafBase = 0;
  private rafOverlay = 0;
  /** Tile size the view was last laid out at, so a change of scale can be anchored on its middle. */
  private lastTilePx = 0;

  protected readonly tilePx = computed(() => SPRITE_SIZE * this.zoom());
  protected readonly cssW = computed(() => MAP_WIDTH * this.tilePx());
  protected readonly cssH = computed(() => MAP_HEIGHT * this.tilePx());
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
      this.painter().version();
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
      this.theme.effective();
      untracked(() => {
        this.requestOverlay();
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

  pasteClip(clip: Clip): void {
    const at = this.hoverCell() ?? this.selection() ?? { x: 0, y: 0 };
    const game = this.game();
    game.transact(() => {
      for (let y = 0; y < clip.h; y++)
        for (let x = 0; x < clip.w; x++) {
          const tx = at.x + x;
          const ty = at.y + y;
          if (tx < MAP_WIDTH && ty < MAP_HEIGHT)
            game.setTile(tx, ty, clip.cells[y * clip.w + x] ?? 0);
        }
    });
    this.selection.set({ x: at.x, y: at.y, w: clip.w, h: clip.h });
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
      x: Math.max(0, Math.min(MAP_WIDTH - 1, Math.floor(p.x))),
      y: Math.max(0, Math.min(MAP_HEIGHT - 1, Math.floor(p.y))),
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
      for (let j = 0; j < b.h; j++)
        for (let i = 0; i < b.w; i++) {
          const spr = erase ? 0 : (b.y + j) * SPRITES_PER_ROW + b.x + i;
          if (spr < SPRITE_COUNT) this.game().setTile(cell.x + i, cell.y + j, spr);
        }
    });
  }

  protected onDown(e: PointerEvent): void {
    if (e.button !== 0 && e.button !== 2) return;
    this.host.nativeElement.focus({ preventScroll: true });
    this.overlay().nativeElement.setPointerCapture(e.pointerId);
    const cell = this.cellOf(e);
    const erase = e.button === 2 || this.tool() === 'erase';
    this.drag = { start: cell, last: cell, erase };
    switch (this.tool()) {
      case 'stamp':
      case 'erase':
        this.stamp(cell, erase);
        break;
      case 'fill': {
        const g = this.game();
        const pts = floodFill((x, y) => g.getTile(x, y), cell, MAP_WIDTH, MAP_HEIGHT);
        const spr = erase ? 0 : this.brush().y * SPRITES_PER_ROW + this.brush().x;
        g.transact(() => {
          for (const p of pts) g.setTile(p.x, p.y, spr);
        });
        this.drag = null;
        break;
      }
      case 'select':
        this.selection.set(null);
        break;
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
    this.drag = null;
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
    const sheet = this.painter().canvas;
    const tiles = game.tiles;
    const showFlags = this.flags();
    const flagColours = FLAG_VARS.map((v) => cssVar(el, v));
    for (let y = 0; y < MAP_HEIGHT; y++)
      for (let x = 0; x < MAP_WIDTH; x++) {
        const spr = tiles[y * MAP_WIDTH + x] ?? 0;
        if (!spr) continue;
        const o = game.spriteOrigin(spr);
        ctx.drawImage(sheet, o.x, o.y, SPRITE_SIZE, SPRITE_SIZE, x * t, y * t, t, t);
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
      for (let x = 1; x < MAP_WIDTH; x++) {
        if (x % 8 === 0) continue;
        ctx.moveTo(x * t + 0.5, 0);
        ctx.lineTo(x * t + 0.5, h);
      }
      for (let y = 1; y < MAP_HEIGHT; y++) {
        if (y % 8 === 0) continue;
        ctx.moveTo(0, y * t + 0.5);
        ctx.lineTo(w, y * t + 0.5);
      }
      ctx.stroke();
      ctx.strokeStyle = cssVar(el, '--nc-sky');
      ctx.globalAlpha = 0.28;
      ctx.beginPath();
      for (let x = 8; x < MAP_WIDTH; x += 8) {
        ctx.moveTo(x * t + 0.5, 0);
        ctx.lineTo(x * t + 0.5, h);
      }
      for (let y = 8; y < MAP_HEIGHT; y += 8) {
        ctx.moveTo(0, y * t + 0.5);
        ctx.lineTo(w, y * t + 0.5);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
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
