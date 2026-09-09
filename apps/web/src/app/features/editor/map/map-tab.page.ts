import { UpperCasePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { type Pt } from '@app/shared/pixel/pixel-tools';
import { SheetPainter } from '@app/shared/pixel/sheet-painter';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { LOCAL_ORIGIN, MAP_HEIGHT, MAP_WIDTH } from '@naucto/engine';
import {
  ButtonDirective,
  IconComponent,
  PanelColumnComponent,
  SectionComponent,
  SliderComponent,
  ToggleButtonComponent,
  ToolGroupComponent,
  type ToolItem,
  TooltipDirective,
} from '@naucto/ui';
import * as Y from 'yjs';

import { SheetViewComponent } from '../art/sheet-view.component';
import { PANEL_WIDTH } from '../state/editor-ui.store';

const MAP_ZOOM_OCTAVES = Math.log2(MAP_MAX_ZOOM / MAP_MIN_ZOOM);
import { WorkSessionService } from '../work-session/work-session.service';
import { MAP_MAX_ZOOM, MAP_MIN_ZOOM, MapStore, type MapTool } from './map.store';
import { MapCanvasComponent, type TileViewport } from './map-canvas.component';
import { MinimapComponent } from './minimap.component';

/** MAP tab: the tile map on the left, tile picker / brush / minimap panel on the right. */
@Component({
  selector: 'nc-map-tab-page',
  imports: [
    UpperCasePipe,
    TranslocoDirective,
    ButtonDirective,
    IconComponent,
    SliderComponent,
    PanelColumnComponent,
    SectionComponent,
    ToggleButtonComponent,
    ToolGroupComponent,
    TooltipDirective,
    SheetViewComponent,
    MapCanvasComponent,
    MinimapComponent,
  ],
  template: `
    <div *transloco="let t" class="grid h-full grid-cols-[minmax(0,1fr)_auto]">
      <section class="flex min-h-0 flex-col">
        <!-- Three tracks, so the tool group is centred on the header rather than on whatever is
             left over between the title and the undo pair. -->
        <header
          class="grid h-(--nc-bar-h) grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-line bg-panel px-2"
        >
          <div class="flex min-w-0 items-center gap-2">
            <span class="font-mono text-meta text-ink">
              {{ t('editor.map.title') | uppercase }}
            </span>
            <span class="label text-ink-4">{{ t('editor.map.tiles', { w: mapW, h: mapH }) }}</span>
          </div>
          <nc-tool-group
            [items]="tools()"
            [value]="map.tool()"
            (valueChange)="setTool($event)"
            [iconSize]="24"
          />
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
        <div class="relative min-h-0 flex-1">
          <nc-map-canvas
            #canvas
            class="h-full bg-page"
            [game]="session.game"
            [painter]="painter"
            [tool]="map.tool()"
            [brush]="map.brush()"
            [grid]="map.grid()"
            [flags]="map.flags()"
            [zoom]="map.zoom()"
            [selection]="map.selection()"
            (selectionChange)="map.setSelection($event)"
            [collaborators]="session.collaborators()"
            [label]="t('editor.map.canvas')"
            (hover)="onHover($event)"
            (pointer)="onPointer($event)"
            (zoomBy)="map.zoomBy($event)"
            (viewport)="viewport.set($event)"
          />
          <!-- Bottom left, over the artwork, on a scrim rather than in a bordered chip: a rule
               around it makes a reading look like a control, and the far corner is where the
               canvas's own furniture already is. -->
          @if (hover(); as h) {
            <div
              class="pointer-events-none absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded-xs bg-page/80 px-1 py-0.5 font-mono text-label text-ink-3"
            >
              <span>{{ t('editor.map.status', { x: h.x, y: h.y, spr: pad3(h.spr) }) }}</span>
              <span class="text-ink-4">·</span>
              <span class="text-jade-ink">
                {{ h.bits ? t('editor.map.flagsOf', { bits: h.bits }) : t('editor.map.noFlags') }}
              </span>
            </div>
          }
        </div>
      </section>

      <!-- No presence: every control in this column is the reader's own — the grid, the flag
           overlay, the zoom, the brush, the minimap. Nothing here writes the document, so a peer's
           pointer over it would say nothing about what they are doing. -->
      <nc-panel-column [width]="PANEL_WIDTH">
        <div actions class="flex min-w-0 flex-1 items-center gap-1">
          <nc-toggle-button
            [checked]="map.grid()"
            (checkedChange)="map.setGrid($event)"
            [ncTooltip]="t('editor.map.gridHelp')"
          >
            <nc-icon name="grid" [size]="24" />
            {{ t('editor.map.grid') }}
          </nc-toggle-button>
          <nc-toggle-button
            [checked]="map.flags()"
            (checkedChange)="map.setFlags($event)"
            accent="jade"
            [ncTooltip]="t('editor.map.flagsHelp')"
          >
            <nc-icon name="label" [size]="24" />
            {{ t('editor.map.flags') }}
          </nc-toggle-button>
          <span class="flex-1"></span>
          <button
            ncButton
            variant="ghost"
            size="sm"
            iconOnly
            class="shrink-0"
            [attr.aria-label]="t('editor.map.zoomOut')"
            (click)="map.zoomBy(-1)"
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
            [label]="t('editor.map.zoom')"
            compact
            hideLabel
          />
          <button
            ncButton
            variant="ghost"
            size="sm"
            iconOnly
            class="shrink-0"
            [attr.aria-label]="t('editor.map.zoomIn')"
            (click)="map.zoomBy(1)"
          >
            <nc-icon name="zoom-in" [size]="24" />
          </button>
          <span class="w-[38px] shrink-0 text-right font-mono text-label text-ink-3">
            ×{{ zoomLabel() }}
          </span>
        </div>

        <nc-section banded [title]="t('editor.map.tilePicker')">
          <!-- A disabled button emits no pointer events in Chrome, so the tooltip that says why it
               is disabled has to hang off something that does. -->
          <span actions class="inline-flex" [ncTooltip]="t('editor.map.autotileSoon')">
            <button ncButton variant="secondary" size="sm" disabled>
              <nc-icon name="layout" [size]="12" />
              {{ t('editor.map.autotile') }}
            </button>
          </span>
          <nc-sheet-view
            [painter]="painter"
            [region]="map.brush()"
            (regionChange)="map.setBrush($event)"
            [resizable]="true"
            [label]="t('editor.map.tilePicker')"
          />
        </nc-section>

        <nc-section banded [title]="t('editor.map.wholeMap')">
          <nc-minimap
            [game]="session.game"
            [painter]="painter"
            [viewport]="viewport()"
            [label]="t('editor.map.wholeMap')"
            (jump)="canvas.scrollToTile($event.x, $event.y)"
          />
        </nc-section>
      </nc-panel-column>
    </div>
  `,
  host: { class: 'block h-full', '(keydown)': 'onKey($event)' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapTabPage {
  /** The thumb's travel as a fraction of the range, so equal travel is equal magnification. */
  protected readonly zoomAt = computed(
    () => Math.log2(this.map.zoom() / MAP_MIN_ZOOM) / MAP_ZOOM_OCTAVES,
  );
  protected readonly zoomLabel = computed(() => {
    const z = this.map.zoom();
    return Number.isInteger(z) ? String(z) : z.toFixed(1);
  });

  protected setZoomAt(at: number): void {
    this.map.setZoom(MAP_MIN_ZOOM * Math.pow(2, at * MAP_ZOOM_OCTAVES));
  }

  protected readonly PANEL_WIDTH = PANEL_WIDTH;
  protected readonly session = inject(WorkSessionService);
  protected readonly map = inject(MapStore);
  private readonly i18n = inject(TranslocoService);
  protected readonly painter = new SheetPainter(this.session.game);
  protected readonly undo: Y.UndoManager;
  protected readonly mapW = MAP_WIDTH;
  protected readonly mapH = MAP_HEIGHT;
  protected readonly canvas = viewChild<MapCanvasComponent>('canvas');
  protected readonly viewport = signal<TileViewport | null>(null);
  protected readonly hover = signal<{ x: number; y: number; spr: number; bits: string } | null>(
    null,
  );
  protected readonly canUndo = signal(false);
  protected readonly canRedo = signal(false);
  protected readonly tools = computed<ToolItem<MapTool>[]>(() => [
    {
      value: 'stamp',
      icon: 'grid',
      label: this.i18n.translate('editor.map.tools.stamp'),
      key: 'S',
    },
    {
      value: 'fill',
      icon: 'paint-bucket',
      label: this.i18n.translate('editor.map.tools.fill'),
      key: 'F',
    },
    {
      value: 'select',
      icon: 'checkbox',
      label: this.i18n.translate('editor.map.tools.select'),
      key: 'M',
    },
    {
      value: 'erase',
      icon: 'close',
      label: this.i18n.translate('editor.map.tools.erase'),
      key: 'E',
    },
  ]);

  constructor() {
    this.undo = new Y.UndoManager([this.session.game.tilesMap], {
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
    inject(DestroyRef).onDestroy(() => {
      this.undo.destroy();
      this.painter.destroy();
      this.session.setCursor(null);
    });
  }

  protected pad3(n: number): string {
    return String(n).padStart(3, '0');
  }

  protected setTool(tool: MapTool | undefined): void {
    if (tool) this.map.setTool(tool);
  }

  /** Presence follows the pointer, not the tile it is over — see `pointer` on the canvas. */
  protected onPointer(p: { x: number; y: number } | null): void {
    // Rounded to a hundredth of a cell: finer than a screen pixel at any zoom the editor
    // offers, and coarse enough that the service's dedupe still collapses a still pointer.
    this.session.setCursor(
      p ? { tab: 'map', x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 } : null,
    );
  }

  protected onHover(p: Pt | null): void {
    if (!p) {
      this.hover.set(null);
      this.session.setCursor(null);
      return;
    }
    const game = this.session.game;
    const spr = game.getTile(p.x, p.y);
    const f = game.getFlag(spr);
    const bits: number[] = [];
    for (let b = 0; b < 8; b++) if (f & (1 << b)) bits.push(b);
    this.hover.set({ x: p.x, y: p.y, spr, bits: bits.join(',') });
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
    if (e.key === 'Delete' || e.key === 'Backspace') {
      this.canvas()?.clearSelection();
      return;
    }
    const tool = ({ s: 'stamp', f: 'fill', m: 'select', e: 'erase' } as Record<string, MapTool>)[
      e.key.toLowerCase()
    ];
    if (tool && !mod) this.map.setTool(tool);
  }
}
