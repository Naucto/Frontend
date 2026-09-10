import { UpperCasePipe } from '@angular/common';
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
import { type Pt } from '@app/shared/pixel/pixel-tools';
import { SheetAtlas } from '@app/shared/pixel/sheet-atlas';
import { SheetPainter } from '@app/shared/pixel/sheet-painter';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { LOCAL_ORIGIN } from '@naucto/engine';
import {
  ButtonDirective,
  ConfirmDialogComponent,
  type ConfirmDialogData,
  DialogService,
  IconComponent,
  PanelColumnComponent,
  SectionComponent,
  SliderComponent,
  type TabItem,
  TabsComponent,
  ToggleButtonComponent,
  ToolGroupComponent,
  type ToolItem,
  TooltipDirective,
} from '@naucto/ui';
import * as Y from 'yjs';

import { SheetViewComponent } from '../art/sheet-view.component';
import { ClipboardStore } from '../state/clipboard.store';
import { PANEL_WIDTH } from '../state/editor-ui.store';

const MAP_ZOOM_OCTAVES = Math.log2(MAP_MAX_ZOOM / MAP_MIN_ZOOM);
import { geometrySignal } from '@app/shared/pixel/geometry.signal';
import { FIRST_MAP_ID, MAX_MAP_SIZE, SPRITE_SIZE } from '@naucto/engine';

import {
  ResourceDialog,
  type ResourceDialogData,
  type ResourceDialogResult,
} from '../resource.dialog';
import { SizeDialog, type SizeDialogData, type SizeDialogResult } from '../size.dialog';
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
    TabsComponent,
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
            <!-- Which map, by name where it has one. The header used to print a fixed string that
                 followed nothing, back when there was only ever one map to follow. -->
            <span class="font-mono text-meta truncate text-ink">{{ mapTitle() }}</span>
            <span class="label text-ink-4">
              {{ t('editor.map.tiles', { w: mapW(), h: mapH() }) }}
            </span>
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
            <button
              ncButton
              variant="ghost"
              size="sm"
              iconOnly
              [attr.aria-label]="t('editor.copy')"
              (click)="transfer('c')"
              [disabled]="!canCopy()"
            >
              <nc-icon name="copy" [size]="24" />
            </button>
            <button
              ncButton
              variant="ghost"
              size="sm"
              iconOnly
              [attr.aria-label]="t('editor.paste')"
              (click)="transfer('v')"
              [disabled]="!canPaste()"
            >
              <nc-icon name="clipboard" [size]="24" />
            </button>
          </div>
        </header>
        <div class="relative min-h-0 flex-1">
          <nc-map-canvas
            #canvas
            class="h-full bg-page"
            [game]="session.game"
            [painter]="painter"
            [atlas]="atlas"
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
            [undo]="undo"
            (pasted)="map.setTool('move')"
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
          <!-- Which sheet the tiles come from. A map's tiles are sprite numbers, and those run
               across every sheet, so this is the one thing the picker could not say. Read-only:
               a sheet is named, coloured and deleted in ART, and offering it here as well would be
               a second place to do the same thing. -->
          <nc-tabs
            variant="small"
            [tabs]="sheetTabs()"
            [value]="map.sheetId()"
            (valueChange)="chooseSheet($event)"
            [label]="t('editor.map.tilesets')"
          />
          <nc-sheet-view
            [painter]="painter"
            [region]="map.brush()"
            (regionChange)="map.setBrush($event)"
            [resizable]="true"
            [label]="t('editor.map.tilePicker')"
          />
        </nc-section>

        <nc-section banded [title]="t('editor.map.wholeMap')">
          <!-- Same strip as the sheets', for the same reason: the sizes ride in it rather than
               under it, so the whole-map view keeps the row a second one would have taken. -->
          <nc-tabs
            variant="small"
            [editable]="true"
            [removable]="true"
            [tabs]="mapTabs()"
            [value]="map.mapId()"
            (valueChange)="chooseMap($event)"
            (edit)="describeMap($event)"
            (remove)="removeMap($event)"
            [editLabel]="t('editor.map.renameMap')"
            [removeLabel]="t('editor.map.deleteMap')"
            [label]="t('editor.map.maps')"
          >
            <span actions class="flex items-center gap-0.5">
              <!-- Adding one is what you do to the strip, so it stays with the tabs; the size is
                   what you do to the one that is chosen, and it is behind a door. -->
              <button
                ncButton
                variant="ghost"
                size="sm"
                iconOnly
                [attr.aria-label]="t('editor.map.addMap')"
                (click)="addMap()"
              >
                <nc-icon name="plus" [size]="12" />
              </button>
              <button
                ncButton
                variant="ghost"
                size="sm"
                iconOnly
                [attr.aria-label]="t('editor.map.mapSize')"
                (click)="openMapSize()"
              >
                <nc-icon name="gear" [size]="12" />
              </button>
            </span>
          </nc-tabs>
          <nc-minimap
            [game]="session.game"
            [painter]="painter"
            [atlas]="atlas"
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
  private readonly clipboard = inject(ClipboardStore);
  private readonly i18n = inject(TranslocoService);
  private readonly dialogs = inject(DialogService);
  protected readonly painter = new SheetPainter(this.session.game);
  /**
   * Every sheet's pixels, for the canvas and the minimap.
   *
   * The painter above holds one sheet, which is what the picker shows. A map draws tiles from all
   * of them at once, so it cannot be served by the same buffer.
   */
  protected readonly atlas = new SheetAtlas(this.session.game);
  protected readonly undo: Y.UndoManager;
  private readonly geometry = geometrySignal(signal(this.session.game));
  protected readonly MAX_MAP_SIZE = MAX_MAP_SIZE;
  /** Ticked when a sheet or a map is added, dropped or renamed — neither is a signal. */
  private readonly collectionsVersion = signal(0);
  /**
   * The map being drawn on, by name where it has one and by number where it has not.
   *
   * A map is born nameless, so the number is not a fallback for a mistake: it is what most maps are
   * called.
   */
  protected readonly mapTitle = computed(() => {
    this.collectionsVersion();
    const maps = this.session.game.maps;
    const at = maps.findIndex((m) => m.id === this.map.mapId());
    const found = maps[at] ?? maps[0];
    // Written out rather than left to `||`: an unnamed map holds the empty string, which nullish
    // coalescing would hand back as a name.
    const name = found?.name ?? '';

    return name === '' ? `#${String((at === -1 ? 0 : at) + 1)}` : name;
  });

  /** Every sheet, as the picker offers them. Numbered and coloured like the strip in ART. */
  protected readonly sheetTabs = computed<TabItem<string>[]>(() => {
    this.collectionsVersion();
    return this.session.game.sheets.map((sh, i) => ({
      value: sh.id,
      label: sh.name,
      index: i + 1,
      colour: sh.colour === null ? undefined : this.session.game.palette[sh.colour],
    }));
  });

  /** The sheet the brush is picked from, or the first where the chosen one is gone. */
  protected readonly sheet = computed(() => {
    this.collectionsVersion();
    const sheets = this.session.game.sheets;

    return sheets.find((sh) => sh.id === this.map.sheetId()) ?? sheets[0];
  });

  protected chooseSheet(id: string | undefined): void {
    if (id !== undefined) this.map.setSheet(id);
  }

  protected readonly mapTabs = computed<TabItem<string>[]>(() => {
    this.geometry();
    this.collectionsVersion();
    return this.session.game.maps.map((m, i) => ({
      value: m.id,
      label: m.name,
      index: i + 1,
      colour: m.colour === null ? undefined : this.session.game.palette[m.colour],
    }));
  });
  protected readonly mapW = computed(() => this.geometry().mapWidth);
  protected readonly mapH = computed(() => this.geometry().mapHeight);
  protected readonly canvas = viewChild<MapCanvasComponent>('canvas');
  protected readonly viewport = signal<TileViewport | null>(null);
  protected readonly hover = signal<{ x: number; y: number; spr: number; bits: string } | null>(
    null,
  );
  protected readonly canUndo = signal(false);
  protected readonly canRedo = signal(false);
  /** Both want a selection to work on, there being no region here to fall back to. */
  protected readonly canCopy = computed(() => this.canvas()?.selection() != null);
  protected readonly canPaste = computed(() => this.clipboard.take('tiles') !== null);
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
    { value: 'move', icon: 'move', label: this.i18n.translate('editor.map.tools.move'), key: 'V' },
  ]);

  constructor() {
    // The brush is bounded by the sheet it is picked from, and the picker draws that sheet: both
    // follow the choice rather than the document's own shape, which is only ever the first sheet's.
    effect(() => {
      const sheet = this.sheet();
      if (!sheet) return;
      untracked(() => {
        this.map.setSheetSize(sheet.width / SPRITE_SIZE, sheet.height / SPRITE_SIZE);
        this.painter.sheetId.set(sheet.id);
        this.painter.follow();
      });
    });
    const off = this.session.game.onCollectionsChange(() => {
      this.collectionsVersion.update((v) => v + 1);
    });
    inject(DestroyRef).onDestroy(off);
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
      this.atlas.destroy();
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

  /** Asks first when tiles would fall outside, then records the size. See ART's, which is its twin. */
  /**
   * A map is a grid of positions, so resizing one renumbers nothing — it only decides how much of
   * the grid there is. What falls outside stays in the file and comes back if it grows again.
   */
  protected openMapSize(): void {
    this.dialogs
      .open<SizeDialog, SizeDialogData, SizeDialogResult | undefined>(SizeDialog, {
        data: {
          title: this.i18n.translate('editor.map.mapSize'),
          note: this.i18n.translate('editor.map.sizeNote'),
          confirmLabel: this.i18n.translate('editor.map.shrinkConfirm'),
          width: this.mapW(),
          height: this.mapH(),
          min: 1,
          max: MAX_MAP_SIZE,
          step: 1,
          consequences: (w, h) => {
            const lost = this.tilesOutside(w, h);

            return lost > 0 ? [this.i18n.translate('editor.map.shrinkMessage', { n: lost })] : [];
          },
        },
      })
      .closed.subscribe((size) => {
        if (size) this.session.game.resize({ mapWidth: size.width, mapHeight: size.height });
      });
  }

  private tilesOutside(width: number, height: number): number {
    const game = this.session.game;
    let n = 0;
    for (let y = 0; y < this.mapH(); y++)
      for (let x = 0; x < this.mapW(); x++)
        if ((x >= width || y >= height) && game.getTile(x, y) !== 0) n++;
    return n;
  }

  protected chooseMap(id: string | undefined): void {
    if (id !== undefined) this.map.setMap(id);
  }

  /**
   * A name nothing else has yet.
   *
   * The dialog refuses a duplicate, so proposing one would only make somebody type over it.
   */
  protected addMap(): void {
    const game = this.session.game;
    // Nameless, like the first one: a map is reached by its number, and a name is something its
    // author gives it when the number stops being enough.
    game.addMap('', this.mapW(), this.mapH());
    const added = game.maps.at(-1);
    if (added) this.map.setMap(added.id);
  }

  protected removeMap(id: string): void {
    const game = this.session.game;
    this.dialogs
      .open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, {
        data: {
          title: this.i18n.translate('editor.map.deleteMapTitle'),
          message: this.i18n.translate('editor.map.deleteMapMessage'),
          confirmLabel: this.i18n.translate('editor.map.deleteMap'),
          danger: true,
        },
      })
      .closed.subscribe((ok) => {
        if (ok !== true) return;
        game.removeMap(id);
        if (this.map.mapId() === id) this.map.setMap(game.maps[0]?.id ?? FIRST_MAP_ID);
      });
  }

  protected describeMap(id: string): void {
    const game = this.session.game;
    const found = game.maps.find((m) => m.id === id);
    if (!found) return;
    this.dialogs
      .open<ResourceDialog, ResourceDialogData, ResourceDialogResult>(ResourceDialog, {
        data: {
          title: this.i18n.translate('editor.map.mapDialog'),
          confirmLabel: this.i18n.translate('editor.resource.save'),
          name: found.name,
          colour: found.colour,
          palette: game.palette,
          taken: game.maps.map((m) => m.name),
        },
      })
      .closed.subscribe((r) => {
        if (!r) return;
        game.describeMap(id, r.name, r.colour);
      });
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
    if (e.key === 'Escape' && this.canvas()?.discardFloating() === true) {
      e.preventDefault();
      return;
    }
    if (e.key === 'Enter') {
      this.canvas()?.settleFloating();
      return;
    }
    if (mod && this.transfer(e.key.toLowerCase())) {
      e.preventDefault();
      return;
    }
    const tool = (
      { s: 'stamp', f: 'fill', m: 'select', e: 'erase', v: 'move' } as Record<string, MapTool>
    )[e.key.toLowerCase()];
    if (tool && !mod) this.map.setTool(tool);
  }

  /** All three want a selection, there being no region in hand to fall back on. */
  protected transfer(key: string): boolean {
    const canvas = this.canvas();
    if (!canvas) return false;
    if (key === 'c' || key === 'x') {
      const clip = canvas.copySelection();
      if (clip) this.clipboard.put(clip);
      if (key === 'x' && clip) canvas.clearSelection();
      return true;
    }
    if (key !== 'v') return false;
    const clip = this.clipboard.take('tiles');
    if (!clip) return true;
    canvas.pasteClip(clip);
    return true;
  }
}
