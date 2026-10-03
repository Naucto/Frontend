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
import { collectionsSignal } from '@app/shared/pixel/collections.signal';
import { geometrySignal } from '@app/shared/pixel/geometry.signal';
import { type Pt, type Transform } from '@app/shared/pixel/pixel-tools';
import { SheetAtlas } from '@app/shared/pixel/sheet-atlas';
import { SheetPainter } from '@app/shared/pixel/sheet-painter';
import { TransformBarComponent } from '@app/shared/pixel/transform-bar.component';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { FIRST_MAP_ID, MAX_MAP_SIZE, SPRITE_SIZE } from '@naucto/engine';
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

import { SheetViewComponent } from '../art/sheet-view.component';
import { injectUndo } from '../art/undo-scope';
import {
  ResourceDialog,
  type ResourceDialogData,
  type ResourceDialogResult,
} from '../resource.dialog';
import { SizeDialog, type SizeDialogData, type SizeDialogResult } from '../size.dialog';
import { ClipboardStore } from '../state/clipboard.store';
import { PANEL_WIDTH } from '../state/editor-ui.store';
import { WorkSessionService } from '../work-session/work-session.service';
import { MAP_MAX_ZOOM, MAP_MIN_ZOOM, MapStore, type MapTool } from './map.store';
import { MapCanvasComponent, type TileViewport } from './map-canvas.component';
import { MinimapComponent } from './minimap.component';

const MAP_ZOOM_OCTAVES = Math.log2(MAP_MAX_ZOOM / MAP_MIN_ZOOM);

/** MAP tab: the tile map on the left, tile picker / brush / minimap panel on the right. */
@Component({
  selector: 'nc-map-tab-page',
  imports: [
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
    TransformBarComponent,
    MinimapComponent,
  ],
  templateUrl: './map-tab.page.html',
  host: { class: 'block h-full', '(keydown)': 'onKey($event)' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapTabPage {
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
  /** The collection map as well as the root tiles: every other map keeps its tiles nested under
   * its entry, and adding, naming or dropping a map is an edit worth taking back too. */
  protected readonly undo = injectUndo([
    this.session.game.tilesMap,
    this.session.game.mapsMap,
    this.session.game.meta,
  ]);
  private readonly geometry = geometrySignal(signal(this.session.game));
  /** Ticked when a sheet or a map is added, dropped or renamed — neither is a signal. */
  private readonly collectionsVersion = collectionsSignal(signal(this.session.game));
  /** The map in hand, or the first when the one chosen is gone. */
  private readonly gameMap = computed(() => {
    this.collectionsVersion();
    this.geometry();
    const maps = this.session.game.maps;

    return maps.find((m) => m.id === this.map.mapId()) ?? maps[0];
  });
  /** The map being drawn on, by name where it has one and by number where it has not — a map is
   * born nameless. */
  protected readonly mapTitle = computed(() => {
    this.collectionsVersion();
    const maps = this.session.game.maps;
    const at = maps.findIndex((m) => m.id === this.map.mapId());
    const found = maps[at] ?? maps[0];
    // An unnamed map holds the empty string, which `??` alone would hand back as a name.
    const name = found?.name ?? '';
    const called = name === '' ? `#${String((at === -1 ? 0 : at) + 1)}` : name;

    return this.i18n.translate('editor.map.mapTitle', { name: called });
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
  protected readonly mapW = computed(() => this.gameMap()?.width ?? 0);
  protected readonly mapH = computed(() => this.gameMap()?.height ?? 0);
  /** The thumb's travel as a fraction of the range, so equal travel is equal magnification. */
  protected readonly zoomAt = computed(
    () => Math.log2(this.map.zoom() / MAP_MIN_ZOOM) / MAP_ZOOM_OCTAVES,
  );
  protected readonly zoomLabel = computed(() => {
    const z = this.map.zoom();
    return Number.isInteger(z) ? String(z) : z.toFixed(1);
  });
  protected readonly canvas = viewChild<MapCanvasComponent>('canvas');
  protected readonly viewport = signal<TileViewport | null>(null);
  protected readonly hover = signal<{ x: number; y: number; spr: number; bits: string } | null>(
    null,
  );
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
      icon: 'marquee',
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
    inject(DestroyRef).onDestroy(() => {
      this.painter.destroy();
      this.atlas.destroy();
      this.session.setCursor(null);
    });
  }

  protected pad3(n: number): string {
    return String(n).padStart(3, '0');
  }

  protected setZoomAt(at: number): void {
    this.map.setZoom(MAP_MIN_ZOOM * Math.pow(2, at * MAP_ZOOM_OCTAVES));
  }

  protected chooseSheet(id: string | undefined): void {
    if (id !== undefined) this.map.setSheet(id);
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
    const spr = this.gameMap()?.getTile(p.x, p.y) ?? 0;
    const f = game.sheetOf(spr)?.getFlag(spr) ?? 0;
    const bits: number[] = [];
    for (let b = 0; b < 8; b++) if (f & (1 << b)) bits.push(b);
    this.hover.set({ x: p.x, y: p.y, spr, bits: bits.join(',') });
  }

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

            return {
              lines: [],
              loss: lost > 0 ? this.i18n.translate('editor.map.shrinkMessage', { n: lost }) : null,
            };
          },
        },
      })
      .closed.subscribe((size) => {
        const map = this.gameMap();
        if (size && map) this.session.game.resizeMap(map.id, size.width, size.height);
      });
  }

  private tilesOutside(width: number, height: number): number {
    const map = this.gameMap();
    if (!map) return 0;
    let n = 0;
    for (let y = 0; y < map.height; y++)
      for (let x = 0; x < map.width; x++)
        if ((x >= width || y >= height) && map.getTile(x, y) !== 0) n++;
    return n;
  }

  protected chooseMap(id: string | undefined): void {
    if (id !== undefined) this.map.setMap(id);
  }

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
    if (this.undo.onKey(e)) return;
    const mod = e.ctrlKey || e.metaKey;
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
    // Capitals, so the flips are one rule in both tabs: a bare `v` is MOVE here.
    const op = (
      { H: 'flipH', V: 'flipV', ']': 'rotateCw', '[': 'rotateCcw' } as Record<string, Transform>
    )[e.key];
    if (op && !mod && this.map.tool() === 'select' && this.map.selection()) {
      e.preventDefault();
      this.canvas()?.transformSelection(op);
      return;
    }
    const tool = (
      { s: 'stamp', f: 'fill', m: 'select', e: 'erase', v: 'move' } as Record<string, MapTool>
    )[e.key.toLowerCase()];
    if (tool && !mod) this.map.setTool(tool);
  }

  /** Copy and cut want a selection, there being no region in hand to fall back on. */
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
