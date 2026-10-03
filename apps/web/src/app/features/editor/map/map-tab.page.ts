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
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { FIRST_MAP_ID, MAX_MAP_SIZE, SPRITE_SIZE } from '@naucto/engine';
import {
  ButtonDirective,
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

import { collectionsSignal } from '../../../shared/pixel/collections.signal';
import { geometrySignal } from '../../../shared/pixel/geometry.signal';
import { type Pt, type Transform } from '../../../shared/pixel/pixel-tools';
import { SheetAtlas } from '../../../shared/pixel/sheet-atlas';
import { SheetPainter } from '../../../shared/pixel/sheet-painter';
import { TransformBarComponent } from '../../../shared/pixel/transform-bar.component';
import { SheetViewComponent } from '../art/sheet-view.component';
import { injectCollectionActions } from '../collection-actions';
import { logZoomScale } from '../log-zoom-scale';
import { SizeDialog, type SizeDialogData, type SizeDialogResult } from '../size.dialog';
import { ClipboardStore } from '../state/clipboard.store';
import { PANEL_WIDTH } from '../state/editor-ui.store';
import { injectUndo } from '../state/undo-scope';
import { SessionPresenceService } from '../work-session/session-presence.service';
import { WorkSessionService } from '../work-session/work-session.service';
import { MAP_MAX_ZOOM, MAP_MIN_ZOOM, MapStore, type MapTool } from './map.store';
import { MapCanvasComponent, type TileViewport } from './map-canvas.component';
import { MinimapComponent } from './minimap.component';

const ZOOM_SCALE = logZoomScale(MAP_MIN_ZOOM, MAP_MAX_ZOOM);

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
export default class MapTabPage {
  protected readonly PANEL_WIDTH = PANEL_WIDTH;
  protected readonly session = inject(WorkSessionService);
  protected readonly presence = inject(SessionPresenceService);
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
  /** The collection map: every map keeps its tiles nested under its entry, and adding, naming or
   * dropping a map is an edit worth taking back too. */
  protected readonly undo = injectUndo([this.session.game.mapsMap, this.session.game.meta]);
  protected readonly maps = injectCollectionActions({
    list: () => this.session.game.maps,
    add: () => {
      this.session.game.addMap('', this.mapW(), this.mapH());
    },
    remove: (id) => {
      this.session.game.removeMap(id);
    },
    describe: (id, name, colour) => {
      this.session.game.describeMap(id, name, colour);
    },
    selected: () => this.map.mapId(),
    select: (id) => {
      this.map.setMap(id);
    },
    fallbackId: FIRST_MAP_ID,
    palette: () => this.session.game.palette,
    keys: {
      dialog: 'editor.map.mapDialog',
      deleteTitle: 'editor.map.deleteMapTitle',
      deleteMessage: 'editor.map.deleteMapMessage',
      deleteConfirm: 'editor.map.deleteMap',
    },
  });
  private readonly geometry = geometrySignal(signal(this.session.game));
  /** Ticked when a sheet or a map is added, dropped or renamed — neither is a signal. */
  private readonly collectionsVersion = collectionsSignal(signal(this.session.game));
  /** The map in hand, or the first when the one chosen is gone. */
  private readonly gameMap = computed(() => {
    this.collectionsVersion();
    this.geometry();
    const maps = this.session.game.maps;

    return maps.find((candidate) => candidate.id === this.map.mapId()) ?? maps[0];
  });
  /** The map being drawn on, by name where it has one and by number where it has not — a map is
   * born nameless. */
  protected readonly mapTitle = computed(() => {
    this.collectionsVersion();
    const maps = this.session.game.maps;
    const at = maps.findIndex((candidate) => candidate.id === this.map.mapId());
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
    return this.session.game.maps.map((entry, i) => ({
      value: entry.id,
      label: entry.name,
      index: i + 1,
      colour: entry.colour === null ? undefined : this.session.game.palette[entry.colour],
    }));
  });
  protected readonly mapW = computed(() => this.gameMap()?.width ?? 0);
  protected readonly mapH = computed(() => this.gameMap()?.height ?? 0);
  protected readonly zoomAt = computed(() => ZOOM_SCALE.positionOf(this.map.zoom()));
  protected readonly zoomLabel = computed(() => {
    const zoom = this.map.zoom();
    return Number.isInteger(zoom) ? String(zoom) : zoom.toFixed(1);
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
      if (!sheet) {
        return;
      }
      untracked(() => {
        this.map.setSheetSize(sheet.width / SPRITE_SIZE, sheet.height / SPRITE_SIZE);
        this.painter.sheetId.set(sheet.id);
        this.painter.follow();
      });
    });
    inject(DestroyRef).onDestroy(() => {
      this.painter.destroy();
      this.atlas.destroy();
      this.presence.setCursor(null);
    });
  }

  protected pad3(value: number): string {
    return String(value).padStart(3, '0');
  }

  protected setZoomAt(at: number): void {
    this.map.setZoom(ZOOM_SCALE.zoomAt(at));
  }

  protected chooseSheet(id: string | undefined): void {
    if (id !== undefined) {
      this.map.setSheet(id);
    }
  }

  protected setTool(tool: MapTool | undefined): void {
    if (tool) {
      this.map.setTool(tool);
    }
  }

  /** Presence follows the pointer, not the tile it is over — see `pointer` on the canvas. */
  protected onPointer(point: { x: number; y: number } | null): void {
    // Rounded to a hundredth of a cell: finer than a screen pixel at any zoom the editor
    // offers, and coarse enough that the service's dedupe still collapses a still pointer.
    this.presence.setCursor(
      point
        ? { tab: 'map', x: Math.round(point.x * 100) / 100, y: Math.round(point.y * 100) / 100 }
        : null,
    );
  }

  protected onHover(point: Pt | null): void {
    if (!point) {
      this.hover.set(null);
      this.presence.setCursor(null);
      return;
    }
    const game = this.session.game;
    const spr = this.gameMap()?.getTile(point.x, point.y) ?? 0;
    const flagMask = game.sheetOf(spr)?.getFlag(spr) ?? 0;
    const bits: number[] = [];
    for (let bit = 0; bit < 8; bit++) {
      if (flagMask & (1 << bit)) {
        bits.push(bit);
      }
    }
    this.hover.set({ x: point.x, y: point.y, spr, bits: bits.join(',') });
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
          consequences: (width, height) => {
            const lost = this.tilesOutside(width, height);

            return {
              lines: [],
              loss: lost > 0 ? this.i18n.translate('editor.map.shrinkMessage', { n: lost }) : null,
            };
          },
        },
      })
      .closed.subscribe((size) => {
        const map = this.gameMap();
        if (size && map) {
          this.session.game.resizeMap(map.id, size.width, size.height);
        }
      });
  }

  private tilesOutside(width: number, height: number): number {
    const map = this.gameMap();
    if (!map) {
      return 0;
    }
    let count = 0;
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if ((x >= width || y >= height) && map.getTile(x, y) !== 0) {
          count++;
        }
      }
    }
    return count;
  }

  protected onKey(event: KeyboardEvent): void {
    if ((event.target as HTMLElement | null)?.tagName === 'INPUT') {
      return;
    }
    if (this.undo.onKey(event)) {
      return;
    }
    const mod = event.ctrlKey || event.metaKey;
    if (event.key === 'Delete' || event.key === 'Backspace') {
      this.canvas()?.clearSelection();
      return;
    }
    if (event.key === 'Escape' && this.canvas()?.discardFloating() === true) {
      event.preventDefault();
      return;
    }
    if (event.key === 'Enter') {
      this.canvas()?.settleFloating();
      return;
    }
    if (mod && this.transfer(event.key.toLowerCase())) {
      event.preventDefault();
      return;
    }
    // Capitals, so the flips are one rule in both tabs: a bare `v` is MOVE here.
    const op = (
      { H: 'flipH', V: 'flipV', ']': 'rotateCw', '[': 'rotateCcw' } as Record<string, Transform>
    )[event.key];
    if (op && !mod && this.map.tool() === 'select' && this.map.selection()) {
      event.preventDefault();
      this.canvas()?.transformSelection(op);
      return;
    }
    const tool = (
      { s: 'stamp', f: 'fill', m: 'select', e: 'erase', v: 'move' } as Record<string, MapTool>
    )[event.key.toLowerCase()];
    if (tool && !mod) {
      this.map.setTool(tool);
    }
  }

  /** Copy and cut want a selection, there being no region in hand to fall back on. */
  protected transfer(key: string): boolean {
    const canvas = this.canvas();
    if (!canvas) {
      return false;
    }
    return this.clipboard.transfer(key, {
      kind: 'tiles',
      copy: () => canvas.copySelection(),
      hasSelection: () => canvas.selection() !== null,
      clear: () => {
        canvas.clearSelection();
      },
      paste: (clip) => {
        canvas.pasteClip(clip);
      },
    });
  }
}
