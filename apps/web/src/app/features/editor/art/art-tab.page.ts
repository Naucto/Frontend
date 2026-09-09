import { UpperCasePipe } from '@angular/common';
import type { ElementRef } from '@angular/core';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { PaletteGridComponent } from '@app/shared/pixel/palette-grid.component';
import { type Pt } from '@app/shared/pixel/pixel-tools';
import { SheetPainter } from '@app/shared/pixel/sheet-painter';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import {
  BUBBLEGUM_16,
  LOCAL_ORIGIN,
  PICO8_PALETTE,
  SPRITE_COUNT,
  SPRITE_SIZE,
  SPRITES_PER_ROW,
} from '@naucto/engine';
import {
  BitFlagsComponent,
  ButtonDirective,
  HelpDotComponent,
  IconComponent,
  PanelColumnComponent,
  PopoverDirective,
  PopoverPanelComponent,
  SectionComponent,
  SliderComponent,
  ToggleButtonComponent,
  ToolGroupComponent,
  type ToolItem,
} from '@naucto/ui';
import * as Y from 'yjs';

import { ClipboardStore } from '../state/clipboard.store';
import { PANEL_WIDTH } from '../state/editor-ui.store';
import { PresenceSurfaceComponent } from '../work-session/presence-surface.component';
import { WorkSessionService } from '../work-session/work-session.service';
import { ArtStore, type ArtTool } from './art.store';
import { PaletteEditorComponent } from './palette-editor.component';
import { SheetViewComponent } from './sheet-view.component';
import { MAX_ZOOM, MIN_ZOOM, SpriteCanvasComponent } from './sprite-canvas.component';

const ZOOM_OCTAVES = Math.log2(MAX_ZOOM / MIN_ZOOM);
const PRESETS: { name: string; colours: readonly string[] }[] = [
  { name: 'Bubblegum 16', colours: BUBBLEGUM_16 },
  { name: 'PICO-8', colours: PICO8_PALETTE },
];

/** ART tab: the sheet and the tools on the left, sheet map / flags / palette panel on the right. */
@Component({
  selector: 'nc-art-tab-page',
  imports: [
    UpperCasePipe,
    TranslocoDirective,
    ButtonDirective,
    IconComponent,
    PanelColumnComponent,
    SectionComponent,
    HelpDotComponent,
    BitFlagsComponent,
    SliderComponent,
    ToggleButtonComponent,
    ToolGroupComponent,
    PopoverDirective,
    PopoverPanelComponent,
    PaletteGridComponent,
    PaletteEditorComponent,
    SheetViewComponent,
    SpriteCanvasComponent,
    PresenceSurfaceComponent,
  ],
  template: `
    <div *transloco="let t" class="grid h-full grid-cols-[minmax(0,1fr)_auto]">
      <section class="flex min-h-0 flex-col">
        <!-- Three tracks, so the tool group is centred on the header rather than on whatever is
             left over between the title and the undo pair. -->
        <header
          class="grid h-(--nc-bar-h) grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-line bg-panel px-2"
        >
          <!-- One line, always: in a 39px strip the readout wrapping to two lines pushes the
               tool group off centre and the strip out of its own height. -->
          <div class="flex min-w-0 items-center gap-2 overflow-hidden">
            <span class="font-mono text-meta whitespace-nowrap tracking-strip text-ink">
              {{ t('editor.art.sprite') | uppercase }} {{ pad3(art.sprite()) }}
            </span>
            @if (art.region().w > 1 || art.region().h > 1) {
              <span class="label whitespace-nowrap text-gold-ink">
                {{ art.region().w }}×{{ art.region().h }}
              </span>
            }
            <span class="label truncate text-ink-4">
              {{ t('editor.art.px', { w: regionPx().w, h: regionPx().h }) }}
            </span>
          </div>
          <nc-tool-group
            [items]="tools()"
            [value]="art.tool()"
            (valueChange)="setTool($event)"
            [iconSize]="24"
          />
          <div class="flex min-w-0 items-center justify-end gap-0.5">
            <!-- Only where there is something to keep a stroke off: with the sheet cropped away
                 there is no sprite next door to reach, so the choice has no subject. -->
            @if (!art.crop()) {
              <nc-toggle-button
                class="shrink-0"
                [checked]="art.clip()"
                (checkedChange)="art.setClip($event)"
              >
                <nc-icon name="lock" [size]="24" />
                {{ t('editor.art.clip') }}
              </nc-toggle-button>
            }
            <nc-toggle-button
              class="mr-1 shrink-0"
              [checked]="art.crop()"
              (checkedChange)="art.setCrop($event)"
            >
              <nc-icon name="frame" [size]="24" />
              {{ t('editor.art.crop') }}
            </nc-toggle-button>
            <button
              ncButton
              variant="ghost"
              size="sm"
              iconOnly
              [attr.aria-label]="t('editor.undo')"
              (click)="undo.undo()"
              [disabled]="!canUndo()"
            >
              <nc-icon name="undo" [size]="24" />
            </button>
            <button
              ncButton
              variant="ghost"
              size="sm"
              iconOnly
              [attr.aria-label]="t('editor.redo')"
              (click)="undo.redo()"
              [disabled]="!canRedo()"
            >
              <nc-icon name="redo" [size]="24" />
            </button>
          </div>
        </header>
        <div class="relative min-h-0 flex-1 bg-inset">
          <nc-sprite-canvas
            #canvas
            class="absolute inset-0"
            [game]="session.game"
            [painter]="painter"
            [region]="art.region()"
            [clip]="art.clip()"
            [crop]="art.crop()"
            [tool]="art.tool()"
            [colour]="art.colour()"
            [grid]="art.grid()"
            [onion]="art.onion()"
            [selection]="art.selection()"
            (selectionChange)="art.setSelection($event)"
            [collaborators]="session.collaborators()"
            [label]="t('editor.art.canvas')"
            (hover)="onHover($event)"
            (pointer)="onPointer($event)"
            (pick)="art.setColour($event)"
            (zoomChange)="zoom.set($event)"
          />
          <!-- Status and preview float over the canvas: the design gives the drawing surface the
               whole column rather than shaving a strip off the bottom of it. -->
          @if (hover(); as h) {
            <!-- Bare text, as the artboard draws it: 9px in ink-4, no chip around it. It was
                 wearing a bordered panel, which made a readout look like a control. -->
            <div
              class="pointer-events-none absolute bottom-1.5 left-1.5 font-mono text-micro tracking-[0.1em] text-ink-4"
            >
              {{ t('editor.art.status', { x: pad3(h.x), y: pad3(h.y), col: pad2(h.col) }) }}
            </div>
          }
          <div class="pointer-events-none absolute right-1.5 bottom-1.5 flex items-center gap-1.25">
            <span class="label">{{ t('editor.art.preview') }}</span>
            <canvas
              #preview
              class="pixelated rounded-xs border border-line"
              [width]="regionPx().w"
              [height]="regionPx().h"
              [style.width.px]="previewCss().w"
              [style.height.px]="previewCss().h"
            ></canvas>
          </div>
        </div>
      </section>

      <nc-panel-column [width]="PANEL_WIDTH">
        <div actions class="flex min-w-0 flex-1 items-center gap-1">
          <nc-toggle-button
            class="shrink-0"
            [checked]="art.grid()"
            (checkedChange)="art.setGrid($event)"
          >
            <nc-icon name="grid" [size]="24" />
            {{ t('editor.art.grid') }}
          </nc-toggle-button>
          <!-- Only where the sheet is cropped away. Uncropped, the previous frame is already on
               screen beside this one, and ghosting a copy of it underneath says nothing. -->
          @if (art.crop()) {
            <nc-toggle-button
              class="shrink-0"
              [checked]="art.onion()"
              (checkedChange)="art.setOnion($event)"
            >
              <nc-icon name="duplicate" [size]="24" />
              {{ t('editor.art.onion') }}
            </nc-toggle-button>
          }
          <span class="flex-1"></span>
          <button
            ncButton
            variant="ghost"
            size="sm"
            iconOnly
            class="shrink-0"
            [attr.aria-label]="t('editor.art.zoomOut')"
            (click)="canvas.zoomBy(-1)"
          >
            <nc-icon name="zoom-out" [size]="24" />
          </button>
          <nc-slider
            class="w-[88px] min-w-[40px] shrink"
            [min]="0"
            [max]="1"
            [step]="0.001"
            [value]="zoomAt()"
            (valueChange)="setZoomAt($event)"
            [label]="t('editor.art.zoom')"
            compact
            hideLabel
          />
          <button
            ncButton
            variant="ghost"
            size="sm"
            iconOnly
            class="shrink-0"
            [attr.aria-label]="t('editor.art.zoomIn')"
            (click)="canvas.zoomBy(1)"
          >
            <nc-icon name="zoom-in" [size]="24" />
          </button>
          <button
            type="button"
            class="control-type w-[38px] shrink-0 text-right font-mono text-ink-3 hover:text-ink"
            [attr.aria-label]="t('editor.art.zoomFit')"
            (click)="canvas.resetZoom()"
          >
            ×{{ zoomLabel() }}
          </button>
        </div>

        <nc-section banded [title]="t('editor.art.sheet')">
          <span actions class="label text-ink-4">
            {{ t('editor.art.used', { used: used(), total: total }) }}
          </span>
          <nc-sheet-view
            [painter]="painter"
            [region]="art.region()"
            (regionChange)="art.setRegion($event)"
            [viewport]="canvas.view()"
            (panTo)="canvas.scrollToCell($event.x, $event.y)"
            resizable
            [label]="t('editor.art.pickSprite')"
          />
        </nc-section>

        <!-- Presence follows what is shared. A flag is written into the document everyone has, so
             a peer's pointer here says what is about to change; the sheet map and the zoom above
             are each person's own view, and a cursor over them would mean nothing. -->
        <nc-section banded [title]="t('editor.art.flags')">
          <nc-help-dot actions [text]="t('editor.art.flagsHelp')" />
          <nc-presence-surface surface="art:flags" />
          <nc-bit-flags
            [value]="flags()"
            (valueChange)="setFlags($event)"
            [label]="t('editor.art.flags')"
          />
        </nc-section>

        <nc-section banded [title]="t('editor.art.palette')">
          <span actions class="flex items-center gap-1">
            <button ncButton variant="ghost" size="sm" [ncPopover]="presets" popoverAlign="end">
              {{ t('editor.art.presets') }}
              <nc-icon name="chevron-down" [size]="12" />
            </button>
            <button ncButton variant="ghost" size="sm" (click)="applyPalette(defaultPalette)">
              {{ t('editor.art.reset') }}
            </button>
          </span>
          <nc-presence-surface surface="art:palette" />
          <ng-template #presets>
            <nc-popover-panel>
              @for (p of presetList; track p.name) {
                <button
                  type="button"
                  class="flex w-full items-center gap-1 px-1 py-0.5 text-left text-body text-ink hover:bg-raised"
                  (click)="applyPalette(p.colours)"
                >
                  <span class="inline-flex">
                    @for (c of p.colours; track $index) {
                      <span class="h-1.5 w-1" [style.background]="c"></span>
                    }
                  </span>
                  {{ p.name }}
                </button>
              }
            </nc-popover-panel>
          </ng-template>
          <nc-palette-grid
            [colours]="palette()"
            [value]="art.colour()"
            (valueChange)="art.setColour($event)"
            [label]="t('editor.art.palette')"
          />
          <nc-palette-editor
            class="mt-1"
            [colours]="palette()"
            [slot]="art.colour()"
            [slotLabel]="t('editor.art.slot') | uppercase"
            [hexLabel]="t('editor.art.hex')"
            (colourChange)="session.game.setPaletteColour($event.slot, $event.hex)"
          />
        </nc-section>
      </nc-panel-column>
    </div>
  `,
  host: { class: 'block h-full', '(keydown)': 'onKey($event)' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ArtTabPage {
  protected readonly PANEL_WIDTH = PANEL_WIDTH;
  protected readonly session = inject(WorkSessionService);
  protected readonly art = inject(ArtStore);
  private readonly clipboard = inject(ClipboardStore);
  private readonly i18n = inject(TranslocoService);
  protected readonly painter = new SheetPainter(this.session.game);
  protected readonly undo: Y.UndoManager;
  protected readonly presetList = PRESETS;
  protected readonly defaultPalette = BUBBLEGUM_16;
  protected readonly total = SPRITE_COUNT;

  protected readonly zoom = signal(1);
  protected readonly hover = signal<{ x: number; y: number; col: number } | null>(null);
  protected readonly canUndo = signal(false);
  protected readonly canRedo = signal(false);
  private readonly flagsVersion = signal(0);
  private readonly canvas = viewChild<SpriteCanvasComponent>('canvas');
  private readonly preview = viewChild<ElementRef<HTMLCanvasElement>>('preview');

  /** The region in sheet pixels — what the preview shows and what the flags are written over. */
  protected readonly regionPx = computed(() => {
    const r = this.art.region();
    return {
      x: r.x * SPRITE_SIZE,
      y: r.y * SPRITE_SIZE,
      w: r.w * SPRITE_SIZE,
      h: r.h * SPRITE_SIZE,
    };
  });
  protected readonly px = computed(() => Math.max(this.regionPx().w, this.regionPx().h));
  /**
   * Where the thumb sits, from 0 to 1. Geometric, so the same travel is the same ratio of
   * magnification wherever on the track it is spent — a linear one would give most of its length
   * to the low scales, where there is nothing to do, and crush the high ones together.
   */
  protected readonly zoomAt = computed(() => Math.log2(this.zoom() / MIN_ZOOM) / ZOOM_OCTAVES);
  protected readonly zoomLabel = computed(() => {
    const z = this.zoom();
    return Number.isInteger(z) ? String(z) : z.toFixed(1);
  });
  /** 50px in the design — a 1:1 8×8 preview is too small to judge a sprite by. */
  protected readonly previewCss = computed(() => {
    const { w, h } = this.regionPx();
    const n = Math.max(1, Math.floor(50 / Math.max(w, h)));
    return { w: Math.min(50, w * n), h: Math.min(50, h * n) };
  });
  protected readonly palette = computed(() => {
    this.painter.version();
    return this.session.game.palette;
  });
  protected readonly used = computed(() => {
    this.painter.version();
    let n = 0;
    for (let i = 0; i < SPRITE_COUNT; i++) if (!this.session.game.isSpriteEmpty(i)) n++;
    return n;
  });
  protected readonly flags = computed(() => {
    this.flagsVersion();
    return this.session.game.getFlag(this.art.sprite());
  });
  protected readonly tools = computed<ToolItem<ArtTool>[]>(() => [
    { value: 'pen', icon: 'edit', label: this.i18n.translate('editor.art.tools.pen'), key: 'P' },
    {
      value: 'fill',
      icon: 'paint-bucket',
      label: this.i18n.translate('editor.art.tools.fill'),
      key: 'F',
    },
    { value: 'line', icon: 'line', label: this.i18n.translate('editor.art.tools.line'), key: 'L' },
    { value: 'rect', icon: 'frame', label: this.i18n.translate('editor.art.tools.rect'), key: 'R' },
    {
      value: 'circle',
      icon: 'circle',
      label: this.i18n.translate('editor.art.tools.circle'),
      key: 'C',
    },
    {
      value: 'select',
      icon: 'checkbox',
      label: this.i18n.translate('editor.art.tools.select'),
      key: 'S',
    },
    {
      value: 'eyedropper',
      icon: 'drop',
      label: this.i18n.translate('editor.art.tools.eyedropper'),
      key: 'I',
    },
    { value: 'move', icon: 'move', label: this.i18n.translate('editor.art.tools.move'), key: 'M' },
  ]);

  constructor() {
    const game = this.session.game;
    this.undo = new Y.UndoManager([game.spritesMap, game.flagsMap, game.paletteArray], {
      trackedOrigins: new Set([LOCAL_ORIGIN, null]),
      captureTimeout: 300,
    });
    const onStack = (): void => {
      this.canUndo.set(this.undo.canUndo());
      this.canRedo.set(this.undo.canRedo());
    };
    this.undo.on('stack-item-added', onStack);
    this.undo.on('stack-item-popped', onStack);
    this.undo.on('stack-cleared', onStack);
    const unsubFlags = game.onFlagsChange(() => {
      this.flagsVersion.update((v) => v + 1);
    });
    inject(DestroyRef).onDestroy(() => {
      unsubFlags();
      this.undo.destroy();
      this.painter.destroy();
      this.session.setCursor(null);
    });
    effect(() => {
      this.painter.version();
      this.art.region();
      this.preview();
      untracked(() => {
        this.drawPreview();
      });
    });
  }

  protected pad2(n: number): string {
    return String(n).padStart(2, '0');
  }
  protected pad3(n: number): string {
    return String(n).padStart(3, '0');
  }

  protected setZoomAt(t: number): void {
    this.canvas()?.setZoom(MIN_ZOOM * Math.pow(2, t * ZOOM_OCTAVES));
  }

  protected setTool(tool: ArtTool | undefined): void {
    if (tool) this.art.setTool(tool);
  }

  /** Sheet coordinates: the canvas is the whole sheet now, so a region-local pair would go negative
   * the moment the pointer left the outline. */
  protected onHover(p: Pt | null): void {
    if (!p) {
      this.hover.set(null);
      this.session.setCursor(null);
      return;
    }
    this.hover.set({ x: p.x, y: p.y, col: this.session.game.getPixel(p.x, p.y) });
  }

  /** Presence follows the pointer, not the cell it is over — see `pointer` on the canvas. */
  protected onPointer(p: { x: number; y: number } | null): void {
    // Rounded to a hundredth of a cell: finer than a screen pixel at any zoom the editor
    // offers, and coarse enough that the service's dedupe still collapses a still pointer.
    this.session.setCursor(
      p ? { tab: 'art', x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 } : null,
    );
  }

  /** Flags apply to every cell of the region so a multi-cell sprite stays consistent. */
  protected setFlags(value: number): void {
    const game = this.session.game;
    const r = this.art.region();
    game.transact(() => {
      for (let j = 0; j < r.h; j++)
        for (let i = 0; i < r.w; i++) {
          const idx = (r.y + j) * SPRITES_PER_ROW + r.x + i;
          if (idx < SPRITE_COUNT) game.setFlag(idx, value);
        }
    });
  }

  protected applyPalette(colours: readonly string[]): void {
    this.session.game.setPalette(colours);
  }

  protected onKey(e: KeyboardEvent): void {
    if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) this.undo.redo();
      else this.undo.undo();
      return;
    }
    if (mod && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      this.undo.redo();
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      this.canvas()?.clearSelection();
      return;
    }
    if (mod && this.transfer(e.key.toLowerCase())) {
      e.preventDefault();
      return;
    }
    const tool = (
      {
        p: 'pen',
        f: 'fill',
        l: 'line',
        r: 'rect',
        c: 'circle',
        s: 'select',
        i: 'eyedropper',
        m: 'move',
      } as Record<string, ArtTool>
    )[e.key.toLowerCase()];
    if (tool && !mod) this.art.setTool(tool);
  }

  /**
   * Copy falls back to the region when nothing is selected; cut does not. Without the crop or the
   * lock that region is the whole sheet, and a keystroke that empties it has to have been aimed.
   *
   * The paste is bracketed because transactions landing close together merge into one undo step,
   * and a paste has to be its own.
   */
  private transfer(key: string): boolean {
    const canvas = this.canvas();
    if (!canvas) return false;
    if (key === 'c') {
      this.clipboard.put(canvas.copySelection());
      return true;
    }
    if (key === 'x') {
      if (!this.art.selection()) return true;
      this.clipboard.put(canvas.copySelection());
      canvas.clearSelection();
      return true;
    }
    if (key !== 'v') return false;
    const clip = this.clipboard.take('pixels');
    if (!clip) return true;
    this.undo.stopCapturing();
    canvas.pasteClip(clip);
    this.undo.stopCapturing();
    return true;
  }

  private drawPreview(): void {
    const el = this.preview()?.nativeElement;
    const ctx = el?.getContext('2d');
    if (!ctx) return;
    const r = this.regionPx();
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, r.w, r.h);
    ctx.drawImage(this.painter.canvas, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
  }
}
