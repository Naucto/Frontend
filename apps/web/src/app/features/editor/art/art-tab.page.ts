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
  SPRITES_PER_ROW,
} from '@naucto/engine';
import {
  BitFlagsComponent,
  ButtonDirective,
  HelpDotComponent,
  IconComponent,
  PopoverDirective,
  PopoverPanelComponent,
  SegmentedComponent,
  StepperComponent,
  ToggleButtonComponent,
  ToolGroupComponent,
  type ToolItem,
} from '@naucto/ui';
import * as Y from 'yjs';

import { PresenceSurfaceComponent } from '../work-session/presence-surface.component';
import { WorkSessionService } from '../work-session/work-session.service';
import { ArtStore, type ArtTool } from './art.store';
import { PaletteEditorComponent } from './palette-editor.component';
import { SheetViewComponent } from './sheet-view.component';
import { SpriteCanvasComponent } from './sprite-canvas.component';

const SIZES = ['1×1', '2×2', '3×3', '4×4', '5×5', '6×6', '7×7', '8×8'] as const;
const PRESETS: { name: string; colours: readonly string[] }[] = [
  { name: 'Bubblegum 16', colours: BUBBLEGUM_16 },
  { name: 'PICO-8', colours: PICO8_PALETTE },
];

/** ART tab: sprite canvas + tools on the left, sheet / size / flags / palette panel on the right. */
@Component({
  selector: 'nc-art-tab-page',
  imports: [
    UpperCasePipe,
    TranslocoDirective,
    ButtonDirective,
    IconComponent,
    HelpDotComponent,
    BitFlagsComponent,
    SegmentedComponent,
    StepperComponent,
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
  providers: [ArtStore],
  template: `
    <div *transloco="let t" class="grid h-full grid-cols-[minmax(0,1fr)_420px]">
      <section class="flex min-h-0 flex-col">
        <!-- Three tracks, so the tool group is centred on the header rather than on whatever is
             left over between the title and the undo pair. -->
        <header
          class="grid h-5 grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-line bg-panel px-2"
        >
          <!-- One line, always: in a 39px strip the readout wrapping to two lines pushes the
               tool group off centre and the strip out of its own height. -->
          <div class="flex min-w-0 items-center gap-2 overflow-hidden">
            <span class="font-mono text-meta whitespace-nowrap tracking-strip text-ink">
              {{ t('editor.art.sprite') | uppercase }} {{ pad3(art.sprite()) }}
            </span>
            <span class="label truncate text-ink-4">{{ t('editor.art.px', { n: px() }) }}</span>
          </div>
          <nc-tool-group [items]="tools()" [value]="art.tool()" (valueChange)="setTool($event)" />
          <div class="flex items-center justify-end gap-0.5">
            <button
              ncButton
              variant="ghost"
              size="sm"
              iconOnly
              [attr.aria-label]="t('editor.undo')"
              (click)="undo.undo()"
              [disabled]="!canUndo()"
            >
              <nc-icon name="undo" [size]="12" />
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
              <nc-icon name="redo" [size]="12" />
            </button>
          </div>
        </header>
        <div class="relative min-h-0 flex-1 bg-inset">
          <nc-sprite-canvas
            #canvas
            class="absolute inset-0"
            [game]="session.game"
            [painter]="painter"
            [sprite]="art.sprite()"
            [size]="art.size()"
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
              {{ t('editor.art.status', { x: pad2(h.x), y: pad2(h.y), col: pad2(h.col) }) }}
            </div>
          }
          <div class="pointer-events-none absolute right-1.5 bottom-1.5 flex items-center gap-1.25">
            <span class="label">{{ t('editor.art.preview') }}</span>
            <canvas
              #preview
              class="pixelated rounded-xs border border-line"
              [width]="px()"
              [height]="px()"
              [style.width.px]="previewCss()"
              [style.height.px]="previewCss()"
            ></canvas>
          </div>
        </div>
      </section>

      <aside class="relative flex min-h-0 flex-col overflow-auto border-l border-line bg-panel">
        <!-- Isolated: everyone is on their own sprite, so a peer's pointer over the palette or the
               sheet is a coordinate that means something different to each of you. The flag says
             somebody is working in here and fades when they leave; it does not chase them. -->
        <nc-presence-surface surface="art:inspector" mode="isolated" />
        <div class="flex h-5 items-center gap-1 border-b border-line px-1.5">
          <nc-toggle-button [checked]="art.grid()" (checkedChange)="art.setGrid($event)">
            <nc-icon name="grid" [size]="12" />
            {{ t('editor.art.grid') }}
          </nc-toggle-button>
          <nc-toggle-button [checked]="art.onion()" (checkedChange)="art.setOnion($event)">
            <nc-icon name="duplicate" [size]="12" />
            {{ t('editor.art.onion') }}
          </nc-toggle-button>
          <span class="flex-1"></span>
          <!-- A real control, the same one the MAP tab has. This used to be a zoom-in glyph that
               was not a button next to a number nothing could change. -->
          <button
            ncButton
            variant="ghost"
            size="sm"
            iconOnly
            [attr.aria-label]="t('editor.art.zoomOut')"
            (click)="canvas.zoomBy(-1)"
          >
            <nc-icon name="zoom-out" [size]="12" />
          </button>
          <button
            type="button"
            class="font-mono text-label text-ink-3 hover:text-ink"
            [attr.aria-label]="t('editor.art.zoomFit')"
            (click)="canvas.resetZoom()"
          >
            ×{{ zoom() }}
          </button>
          <button
            ncButton
            variant="ghost"
            size="sm"
            iconOnly
            [attr.aria-label]="t('editor.art.zoomIn')"
            (click)="canvas.zoomBy(1)"
          >
            <nc-icon name="zoom-in" [size]="12" />
          </button>
        </div>

        <div class="border-b border-line p-1.5">
          <div class="mb-1 flex items-center gap-1">
            <span class="label text-ink-3">{{ t('editor.art.sheet') }}</span>
            <!-- The densest strip in the app: 20 tall on 7px of padding, against the 24 a hub
                 filter gets. Same component, half the air. -->
            <nc-segmented
              variant="chips"
              size="sm"
              [options]="bands"
              [value]="String(art.band())"
              (valueChange)="art.setBand(Number($event))"
            />
            <span class="flex-1"></span>
            <span class="label text-ink-4">
              {{ t('editor.art.used', { used: used(), total: total }) }}
            </span>
          </div>
          <nc-sheet-view
            [painter]="painter"
            [value]="art.sprite()"
            (valueChange)="art.setSprite($event)"
            [size]="art.size()"
            [band]="art.band()"
            [label]="t('editor.art.pickSprite')"
          />
        </div>

        <div class="border-b border-line p-1.5">
          <div class="mb-1 flex items-center justify-between">
            <span class="label text-ink-3">{{ t('editor.art.spriteSize') }}</span>
            <span class="font-mono text-label text-ink">
              {{ t('editor.art.sizeReadout', { n: art.size(), px: px() }) }}
            </span>
          </div>
          <nc-stepper
            [options]="sizes"
            [value]="art.size() - 1"
            (valueChange)="art.setSize($event + 1)"
            [label]="t('editor.art.spriteSize')"
          />
        </div>

        <div class="border-b border-line p-1.5">
          <div class="mb-1 flex items-center justify-between">
            <span class="label text-ink-3">{{ t('editor.art.flags') }}</span>
            <nc-help-dot [text]="t('editor.art.flagsHelp')" />
          </div>
          <nc-bit-flags
            [value]="flags()"
            (valueChange)="setFlags($event)"
            [label]="t('editor.art.flags')"
          />
        </div>

        <!-- The palette sits in a sunken well: it is the one section of the panel you edit
             colours in, not just pick from. -->
        <div class="bg-sunken p-1.5">
          <div class="mb-1 flex items-center gap-1">
            <!-- Gold, as the design writes it: the palette is the one thing on this panel that
                 changes what every other tab draws. -->
            <span class="label text-gold-ink">{{ t('editor.art.palette') }}</span>
            <span class="flex-1"></span>
            <button ncButton variant="ghost" size="sm" [ncPopover]="presets" popoverAlign="end">
              {{ t('editor.art.presets') }}
              <nc-icon name="chevron-down" [size]="12" />
            </button>
            <button ncButton variant="ghost" size="sm" (click)="applyPalette(defaultPalette)">
              {{ t('editor.art.reset') }}
            </button>
          </div>
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
        </div>
      </aside>
    </div>
  `,
  host: { class: 'block h-full', '(keydown)': 'onKey($event)' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ArtTabPage {
  protected readonly session = inject(WorkSessionService);
  protected readonly art = inject(ArtStore);
  private readonly i18n = inject(TranslocoService);
  protected readonly painter = new SheetPainter(this.session.game);
  protected readonly undo: Y.UndoManager;
  protected readonly sizes = SIZES;
  protected readonly bands = ['0', '1', '2', '3'].map((v) => ({ value: v, label: v }));
  protected readonly presetList = PRESETS;
  protected readonly defaultPalette = BUBBLEGUM_16;
  protected readonly total = SPRITE_COUNT;
  protected readonly String = String;
  protected readonly Number = Number;

  protected readonly zoom = signal(1);
  protected readonly hover = signal<{ x: number; y: number; col: number } | null>(null);
  protected readonly canUndo = signal(false);
  protected readonly canRedo = signal(false);
  private readonly flagsVersion = signal(0);
  private readonly canvas = viewChild<SpriteCanvasComponent>('canvas');
  private readonly preview = viewChild<ElementRef<HTMLCanvasElement>>('preview');

  protected readonly px = computed(() => this.art.size() * 8);
  /** 50px in the design — a 1:1 8×8 preview is too small to judge a sprite by. */
  protected readonly previewCss = computed(() => {
    const px = this.px();
    return px <= 50 ? px * Math.floor(50 / px) : 50;
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
      this.art.sprite();
      this.art.size();
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

  protected setTool(tool: ArtTool | undefined): void {
    if (tool) this.art.setTool(tool);
  }

  protected onHover(p: Pt | null): void {
    if (!p) {
      this.hover.set(null);
      this.session.setCursor(null);
      return;
    }
    const o = this.session.game.spriteOrigin(this.art.sprite());
    this.hover.set({ x: p.x - o.x, y: p.y - o.y, col: this.session.game.getPixel(p.x, p.y) });
  }

  /** Presence follows the pointer, not the cell it is over — see `pointer` on the canvas. */
  protected onPointer(p: { x: number; y: number } | null): void {
    // Rounded to a hundredth of a cell: finer than a screen pixel at any zoom the editor
    // offers, and coarse enough that the service's dedupe still collapses a still pointer.
    this.session.setCursor(
      p ? { tab: 'art', x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 } : null,
    );
  }

  /** Flags apply to every cell of the current block so multi-cell sprites stay consistent. */
  protected setFlags(value: number): void {
    const game = this.session.game;
    const base = this.art.sprite();
    const n = this.art.size();
    game.transact(() => {
      for (let j = 0; j < n; j++)
        for (let i = 0; i < n; i++) {
          const idx = base + i + j * SPRITES_PER_ROW;
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

  private drawPreview(): void {
    const el = this.preview()?.nativeElement;
    const ctx = el?.getContext('2d');
    if (!ctx) return;
    const px = this.px();
    const o = this.session.game.spriteOrigin(this.art.sprite());
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, px, px);
    ctx.drawImage(this.painter.canvas, o.x, o.y, px, px, 0, 0, px, px);
  }
}
