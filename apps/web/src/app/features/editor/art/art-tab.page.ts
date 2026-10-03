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
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { FIRST_SHEET_ID, MAX_SHEET_SIZE, type ResizePreview, SIZE_STEP } from '@naucto/engine';
import { BUBBLEGUM_16, PICO8_PALETTE, SPRITE_SIZE } from '@naucto/engine';
import {
  BitFlagsComponent,
  ButtonDirective,
  DialogService,
  HelpDotComponent,
  IconComponent,
  PanelColumnComponent,
  PopoverDirective,
  PopoverPanelComponent,
  SectionComponent,
  SliderComponent,
  type TabItem,
  TabsComponent,
  ToggleButtonComponent,
  ToolGroupComponent,
  type ToolItem,
} from '@naucto/ui';

import { collectionsSignal } from '../../../shared/pixel/collections.signal';
import { geometrySignal } from '../../../shared/pixel/geometry.signal';
import { PaletteGridComponent } from '../../../shared/pixel/palette-grid.component';
import { type Pt, type Transform } from '../../../shared/pixel/pixel-tools';
import { SheetPainter } from '../../../shared/pixel/sheet-painter';
import { TransformBarComponent } from '../../../shared/pixel/transform-bar.component';
import { injectCollectionActions } from '../collection-actions';
import { logZoomScale } from '../log-zoom-scale';
import {
  type SizeCost,
  SizeDialog,
  type SizeDialogData,
  type SizeDialogResult,
} from '../size.dialog';
import { ClipboardStore } from '../state/clipboard.store';
import { PANEL_WIDTH } from '../state/editor-ui.store';
import { injectUndo } from '../state/undo-scope';
import { PresenceSurfaceComponent } from '../work-session/presence-surface.component';
import { SessionPresenceService } from '../work-session/session-presence.service';
import { WorkSessionService } from '../work-session/work-session.service';
import { ArtStore, type ArtTool } from './art.store';
import { PaletteEditorComponent } from './palette-editor.component';
import { SheetViewComponent } from './sheet-view.component';
import { MAX_ZOOM, MIN_ZOOM, SpriteCanvasComponent } from './sprite-canvas.component';

const ZOOM_SCALE = logZoomScale(MIN_ZOOM, MAX_ZOOM);
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
    TabsComponent,
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
    TransformBarComponent,
    PresenceSurfaceComponent,
  ],
  templateUrl: './art-tab.page.html',
  host: { class: 'block h-full', '(keydown)': 'onKey($event)' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class ArtTabPage {
  protected readonly PANEL_WIDTH = PANEL_WIDTH;
  protected readonly session = inject(WorkSessionService);
  protected readonly presence = inject(SessionPresenceService);
  protected readonly art = inject(ArtStore);
  private readonly clipboard = inject(ClipboardStore);
  private readonly i18n = inject(TranslocoService);
  private readonly dialogs = inject(DialogService);
  protected readonly painter = new SheetPainter(this.session.game);
  protected readonly geometry = geometrySignal(signal(this.session.game));
  /** Ticks when the document's sheets change, so everything derived from them agrees. */
  private readonly sheetsVersion = collectionsSignal(signal(this.session.game));
  /**
   * The sheet being drawn on, by name where it has one and by number where it has not.
   *
   * A sheet is born nameless, so the number is not a fallback for a mistake: it is what most sheets
   * are called.
   */
  protected readonly sheetTitle = computed(() => {
    // Read so a rename reaches the bandeau: the sheet list is a plain array off the document, and
    // nothing about reading it again would tell this it has changed.
    this.sheetsVersion();
    const sheets = this.session.game.sheets;
    const at = sheets.findIndex((candidate) => candidate.id === this.art.sheetId());
    const sheet = sheets[at] ?? sheets[0];
    // An unnamed sheet holds the empty string, which `??` alone would hand back as a name.
    const name = sheet?.name ?? '';
    const called = name === '' ? `#${String((at === -1 ? 0 : at) + 1)}` : name;

    return this.i18n.translate('editor.art.tilesetTitle', { name: called });
  });

  protected readonly sheetTabs = computed<TabItem<string>[]>(() => {
    this.geometry();
    this.sheetsVersion();
    return this.session.game.sheets.map((sheet, i) => ({
      value: sheet.id,
      label: sheet.name,
      index: i + 1,
      colour: sheet.colour === null ? undefined : this.session.game.palette[sheet.colour],
    }));
  });
  /** The sheet the tabs chose. Everything the panel shows is about this one. */
  protected readonly sheet = computed(() => {
    this.geometry();
    this.sheetsVersion();
    const sheets = this.session.game.sheets;
    return sheets.find((sheet) => sheet.id === this.art.sheetId()) ?? sheets[0];
  });
  /** Sheets keep their pixels and flags nested under the sheet collection, and an undo manager
   * reaches nested types only through a type in its scope. */
  protected readonly undo = injectUndo([
    this.session.game.paletteArray,
    this.session.game.sheetsMap,
    this.session.game.mapsMap,
    this.session.game.codeFiles,
    this.session.game.meta,
  ]);
  protected readonly sheets = injectCollectionActions({
    list: () => this.session.game.sheets,
    add: () => {
      const { sheetWidth, sheetHeight } = this.geometry();
      this.session.game.addSheet('', sheetWidth, sheetHeight);
    },
    remove: (id) => {
      this.session.game.removeSheet(id);
    },
    describe: (id, name, colour) => {
      this.session.game.describeSheet(id, name, colour);
    },
    selected: () => this.art.sheetId(),
    select: (id) => {
      this.art.setSheet(id);
    },
    fallbackId: FIRST_SHEET_ID,
    palette: () => this.session.game.palette,
    keys: {
      dialog: 'editor.art.sheetDialog',
      deleteTitle: 'editor.art.deleteSheetTitle',
      deleteMessage: 'editor.art.deleteSheetMessage',
      deleteConfirm: 'editor.art.deleteSheet',
    },
  });
  protected readonly presetList = PRESETS;
  protected readonly defaultPalette = BUBBLEGUM_16;

  protected readonly zoom = computed(() => this.canvas()?.zoom() ?? 1);
  protected readonly hover = signal<{ x: number; y: number; col: number } | null>(null);
  /** Copy has no button state to carry: with nothing selected it takes the region, which is always
   * there. Paste has one, because a clip of colours is not a clip of tiles. */
  protected readonly canPaste = computed(() => this.clipboard.take('pixels') !== null);
  private readonly flagsVersion = signal(0);
  private readonly canvas = viewChild<SpriteCanvasComponent>('canvas');
  private readonly preview = viewChild<ElementRef<HTMLCanvasElement>>('preview');

  /** The region in sheet pixels — what the preview shows and what the flags are written over. */
  protected readonly regionPx = computed(() => {
    const region = this.art.region();
    return {
      x: region.x * SPRITE_SIZE,
      y: region.y * SPRITE_SIZE,
      w: region.w * SPRITE_SIZE,
      h: region.h * SPRITE_SIZE,
    };
  });
  protected readonly zoomAt = computed(() => ZOOM_SCALE.positionOf(this.zoom()));
  protected readonly zoomLabel = computed(() =>
    Number.isInteger(this.zoom()) ? String(this.zoom()) : this.zoom().toFixed(1),
  );
  /** Scaled by a whole factor up to the preview box: a 1:1 8×8 preview is too small to judge. */
  protected readonly previewCss = computed(() => {
    const { w, h } = this.regionPx();
    const scale = Math.max(1, Math.floor(50 / Math.max(w, h)));
    return { w: Math.min(50, w * scale), h: Math.min(50, h * scale) };
  });
  protected readonly palette = computed(() => {
    this.painter.version();
    return this.session.game.palette;
  });
  protected readonly flags = computed(() => {
    this.flagsVersion();
    return this.sheet()?.getFlag(this.spriteNumber()) ?? 0;
  });
  /** The region's first cell as a sprite number, which counts from the sheet's own first. */
  protected readonly spriteNumber = computed(() => (this.sheet()?.base ?? 0) + this.art.sprite());
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
      icon: 'marquee',
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
    // One painter, pointed at whichever sheet the tabs chose: it is the source every view here
    // draws from, so switching it is what makes the canvas, the map and the preview follow.
    effect(() => {
      const id = this.art.sheetId();
      this.sheetsVersion();
      untracked(() => {
        this.painter.sheetId.set(id);
        this.painter.follow();
      });
    });
    // The store clamps the region against the sheet, so it has to be told when the sheet changes.
    effect(() => {
      const sheet = this.sheet();
      untracked(() => {
        if (!sheet) {
          return;
        }
        if (sheet.id !== this.art.sheetId()) {
          this.art.setSheet(sheet.id);
        }
        this.art.setSheetSize(sheet.cols, sheet.rows);
      });
    });
    const unsubFlags = this.session.game.onFlagsChange(() => {
      this.flagsVersion.update((version) => version + 1);
    });
    inject(DestroyRef).onDestroy(() => {
      unsubFlags();
      this.painter.destroy();
      this.presence.setCursor(null);
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

  protected pad2(value: number): string {
    return String(value).padStart(2, '0');
  }
  protected pad3(value: number): string {
    return String(value).padStart(3, '0');
  }

  protected setZoomAt(position: number): void {
    this.canvas()?.setZoom(ZOOM_SCALE.zoomAt(position));
  }

  protected setTool(tool: ArtTool | undefined): void {
    if (tool) {
      this.art.setTool(tool);
    }
  }

  protected onHover(point: Pt | null): void {
    if (!point) {
      this.hover.set(null);
      this.presence.setCursor(null);
      return;
    }
    this.hover.set({ x: point.x, y: point.y, col: this.sheet()?.getPixel(point.x, point.y) ?? 0 });
  }

  /** Presence follows the pointer, not the cell it is over — see `pointer` on the canvas. */
  protected onPointer(pointer: { x: number; y: number } | null): void {
    // Rounded to a hundredth of a cell: finer than a screen pixel at any zoom the editor
    // offers, and coarse enough that the service's dedupe still collapses a still pointer.
    this.presence.setCursor(
      pointer
        ? { tab: 'art', x: Math.round(pointer.x * 100) / 100, y: Math.round(pointer.y * 100) / 100 }
        : null,
    );
  }

  /** Flags apply to every cell of the region so a multi-cell sprite stays consistent. */
  protected setFlags(value: number): void {
    const sheet = this.sheet();
    if (!sheet) {
      return;
    }
    const region = this.art.region();
    this.session.game.transact(() => {
      for (let j = 0; j < region.h; j++) {
        for (let i = 0; i < region.w; i++) {
          sheet.setFlag(sheet.base + (region.y + j) * sheet.cols + region.x + i, value);
        }
      }
    });
  }

  protected applyPalette(colours: readonly string[]): void {
    this.session.game.setPalette(colours);
  }

  /**
   * Resizing a sheet is not only a size: the picture stays where it is and the grid of numbers
   * re-flows over it, so a sprite number comes to mean a different cell — and so does every number
   * on every sheet after this one. Everything that wrote one by hand is brought along, and the
   * dialog says how much that is while the size is being chosen.
   */
  protected openSheetSize(): void {
    const sheet = this.sheet();
    if (!sheet) {
      return;
    }
    this.dialogs
      .open<SizeDialog, SizeDialogData, SizeDialogResult | undefined>(SizeDialog, {
        data: {
          title: this.i18n.translate('editor.art.sheetSize'),
          note: this.i18n.translate('editor.art.renumberMessage'),
          confirmLabel: this.i18n.translate('editor.art.renumberConfirm'),
          width: sheet.width,
          height: sheet.height,
          min: SIZE_STEP,
          max: MAX_SHEET_SIZE,
          step: SIZE_STEP,
          consequences: (width, height) =>
            this.renumberLines(this.session.game.previewResize(sheet.id, width, height)),
        },
      })
      .closed.subscribe((size) => {
        if (size) {
          this.applySheetSize(size.width, size.height);
        }
      });
  }

  private renumberLines(cost: ResizePreview): SizeCost {
    const lines: string[] = [];
    if (cost.tiles > 0) {
      lines.push(this.i18n.translate('editor.art.renumberTiles', { n: cost.tiles }));
    }
    if (cost.calls > 0) {
      lines.push(this.i18n.translate('editor.art.renumberCalls', { n: cost.calls }));
    }
    if (cost.unsure > 0) {
      lines.push(this.i18n.translate('editor.art.renumberUnsure', { n: cost.unsure }));
    }

    return {
      lines,
      loss:
        cost.lost > 0 ? this.i18n.translate('editor.art.shrinkMessage', { n: cost.lost }) : null,
    };
  }

  private applySheetSize(width: number, height: number): void {
    const sheet = this.sheet();
    if (!sheet) {
      return;
    }
    this.session.game.resizeSheet(sheet.id, width, height);
  }

  protected onKey(event: KeyboardEvent): void {
    if ((event.target as HTMLElement | null)?.tagName === 'INPUT') {
      return;
    }
    if (this.undo.onKey(event)) {
      return;
    }
    const mod = event.ctrlKey || event.metaKey;
    if (event.key === 'Escape' && this.canvas()?.discardFloating() === true) {
      event.preventDefault();
      return;
    }
    if (event.key === 'Enter') {
      this.canvas()?.settleFloating();
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      this.canvas()?.clearSelection();
      return;
    }
    if (mod && this.transfer(event.key.toLowerCase())) {
      event.preventDefault();
      return;
    }
    // Capitals, so the flips are one rule in both tabs: a bare `v` is MOVE on the map.
    const op = (
      { H: 'flipH', V: 'flipV', ']': 'rotateCw', '[': 'rotateCcw' } as Record<string, Transform>
    )[event.key];
    if (op && !mod && this.art.tool() === 'select' && this.art.selection()) {
      event.preventDefault();
      this.canvas()?.transformSelection(op);
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
    )[event.key.toLowerCase()];
    if (tool && !mod) {
      this.art.setTool(tool);
    }
  }

  /**
   * Copy falls back to the region when nothing is selected; cut does not. Without the crop or the
   * lock that region is the whole sheet, and a keystroke that empties it has to have been aimed.
   */
  protected transfer(key: string): boolean {
    const canvas = this.canvas();
    if (!canvas) {
      return false;
    }
    return this.clipboard.transfer(key, {
      kind: 'pixels',
      copy: () => canvas.copySelection(),
      hasSelection: () => this.art.selection() !== null,
      clear: () => {
        canvas.clearSelection();
      },
      paste: (clip) => {
        canvas.pasteClip(clip);
      },
    });
  }

  private drawPreview(): void {
    const el = this.preview()?.nativeElement;
    const ctx = el?.getContext('2d');
    if (!el || !ctx) {
      return;
    }
    const region = this.regionPx();
    if (el.width !== region.w) {
      el.width = region.w;
    }
    if (el.height !== region.h) {
      el.height = region.h;
    }
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, region.w, region.h);
    ctx.drawImage(
      this.painter.canvas,
      region.x,
      region.y,
      region.w,
      region.h,
      0,
      0,
      region.w,
      region.h,
    );
  }
}
