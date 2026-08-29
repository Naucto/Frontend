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
  SCREEN_HEIGHT,
  SCREEN_WIDTH,
  SPRITE_COUNT,
  SPRITE_SIZE,
  SPRITES_PER_ROW,
} from '@naucto/engine';
import { PresenceFlagComponent } from '@naucto/ui';

import { type Collaborator } from '../work-session/work-session.service';
import { type MapTool, type TileRect } from './map.store';

export interface TileViewport {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * One colour per flag bit. Bits 6 and 7 used to repeat bits 0 and 1, which made "solid" and
 * "hazard" indistinguishable from two unrelated flags in the overlay.
 */
const FLAG_VARS = [
  '--nc-jade',
  '--nc-sky',
  '--nc-orange',
  '--nc-blush',
  '--nc-hot',
  '--nc-gold',
  '--nc-lime',
  '--nc-magenta',
];

/** The whole 128×32 tile map in a scrollable surface; stamps tiles from the sheet. */
@Component({
  selector: 'nc-map-canvas',
  imports: [PresenceFlagComponent],
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
        class="pixelated absolute inset-0 touch-none"
        [width]="cssW()"
        [height]="cssH()"
        role="img"
        [attr.aria-label]="label()"
        (pointerdown)="onDown($event)"
        (pointermove)="onMove($event)"
        (pointerup)="onUp()"
        (pointercancel)="onUp()"
        (pointerleave)="onLeave()"
        (wheel)="onWheel($event)"
        (contextmenu)="$event.preventDefault()"
      ></canvas>
      @for (f of flagsOf(); track f.clientId) {
        <nc-presence-flag
          class="absolute"
          [style.left.px]="f.x"
          [style.top.px]="f.y"
          [name]="f.name"
          [colour]="f.colour"
        />
      }
    </div>
  `,
  // A map smaller than the viewport is centred rather than pinned to the top-left; `safe` keeps
  // the origin reachable once it is larger.
  host: {
    class: 'flex overflow-auto [align-items:safe_center] [justify-content:safe_center]',
    tabindex: '0',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapCanvasComponent {
  readonly game = input.required<Game>();
  readonly painter = input.required<SheetPainter>();
  readonly tool = input<MapTool>('stamp');
  readonly sprite = input(1);
  readonly brush = input(1);
  readonly grid = input(true);
  readonly flags = input(false);
  readonly zoom = input(2);
  readonly selection = model<TileRect | null>(null);
  readonly collaborators = input<readonly Collaborator[]>([]);
  readonly label = input('Map canvas');
  readonly hover = output<Pt | null>();
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

  protected readonly tilePx = computed(() => SPRITE_SIZE * this.zoom());
  protected readonly cssW = computed(() => MAP_WIDTH * this.tilePx());
  protected readonly cssH = computed(() => MAP_HEIGHT * this.tilePx());
  protected readonly flagsOf = computed(() => {
    const t = this.tilePx();
    return this.collaborators()
      .filter((c) => !c.isSelf && c.cursor?.tab === 'map')
      .map((c) => ({
        clientId: c.clientId,
        name: c.name,
        colour: c.colour,
        x: (c.cursor?.x ?? 0) * t,
        y: (c.cursor?.y ?? 0) * t,
      }));
  });

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

  protected onWheel(e: WheelEvent): void {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    this.zoomBy.emit(e.deltaY < 0 ? 1 : -1);
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
    this.viewport.emit({
      x: el.scrollLeft / t,
      y: el.scrollTop / t,
      w: el.clientWidth / t,
      h: el.clientHeight / t,
    });
  }

  // ---- pointer --------------------------------------------------------------

  private cellOf(e: PointerEvent): Pt {
    const r = this.overlay().nativeElement.getBoundingClientRect();
    const t = this.tilePx();
    return {
      x: Math.max(0, Math.min(MAP_WIDTH - 1, Math.floor((e.clientX - r.left) / t))),
      y: Math.max(0, Math.min(MAP_HEIGHT - 1, Math.floor((e.clientY - r.top) / t))),
    };
  }

  private stamp(cell: Pt, erase: boolean): void {
    const n = this.brush();
    const base = this.sprite();
    this.game().transact(() => {
      for (let j = 0; j < n; j++)
        for (let i = 0; i < n; i++) {
          const spr = erase ? 0 : base + i + j * SPRITES_PER_ROW;
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
        const spr = erase ? 0 : this.sprite();
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
  }

  // ---- drawing --------------------------------------------------------------

  private requestBase(): void {
    cancelAnimationFrame(this.rafBase);
    this.rafBase = requestAnimationFrame(() => {
      this.drawBase();
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
    const z = this.zoom();
    ctx.clearRect(0, 0, this.cssW(), this.cssH());
    // Camera bounds: what the screen shows at the origin. Everything outside it is scrimmed, so
    // the first screen of the map reads as the one the player will actually see.
    const camW = SCREEN_WIDTH * z;
    const camH = SCREEN_HEIGHT * z;
    ctx.fillStyle = cssVar(el, '--nc-page');
    ctx.globalAlpha = 0.45;
    ctx.fillRect(camW, 0, this.cssW() - camW, this.cssH());
    ctx.fillRect(0, camH, camW, this.cssH() - camH);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = cssVar(el, '--nc-gold');
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, camW - 2, camH - 2);
    ctx.lineWidth = 1;
    // The label is a chip sitting *above* the rect, not text floating inside the play area.
    const text = `CAMERA ${String(SCREEN_WIDTH)}×${String(SCREEN_HEIGHT)}`;
    ctx.font = `10px ${cssVar(el, '--font-mono')}`;
    ctx.textBaseline = 'top';
    const chipW = ctx.measureText(text).width + 12;
    ctx.fillStyle = cssVar(el, '--nc-gold');
    ctx.fillRect(0, 0, chipW, 18);
    ctx.fillStyle = cssVar(el, '--color-on-accent');
    ctx.fillText(text, 6, 5);

    const sel = this.selection();
    if (sel) {
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = cssVar(el, '--nc-ink');
      ctx.strokeRect(sel.x * t + 0.5, sel.y * t + 0.5, sel.w * t - 1, sel.h * t - 1);
      ctx.setLineDash([]);
    }
    const h = this.hoverCell();
    if (h) {
      const n = this.tool() === 'stamp' || this.tool() === 'erase' ? this.brush() : 1;
      ctx.strokeStyle = cssVar(el, '--nc-ink');
      ctx.lineWidth = 2;
      ctx.strokeRect(h.x * t + 1, h.y * t + 1, n * t - 2, n * t - 2);
      ctx.lineWidth = 1;
    }
  }
}
