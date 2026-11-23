import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { inject } from '@angular/core';
import { BUBBLEGUM_16 } from '@naucto/engine';
import {
  ArrowLinkDirective,
  AvatarComponent,
  BitFlagsComponent,
  BrandMarkComponent,
  ButtonDirective,
  CheckboxComponent,
  ChipComponent,
  DialogService,
  DialogShellComponent,
  DisclosureComponent,
  EdgeHandleComponent,
  EmptyStateComponent,
  ErrorStateComponent,
  FieldComponent,
  HelpDotComponent,
  HighlightComponent,
  ICON_GLYPHS,
  IconComponent,
  type IconName,
  InputDirective,
  JoinedDirective,
  KeycapComponent,
  LabelComponent,
  LcdComponent,
  LogoComponent,
  MARK_GLYPHS,
  MarkComponent,
  type MarkName,
  MediaActionDirective,
  MediaFrameComponent,
  MeterComponent,
  NoticeComponent,
  NumberFieldComponent,
  OnlineDotComponent,
  OptionDirective,
  PadCapComponent,
  type PadDirection,
  PagerComponent,
  PanelColumnComponent,
  PanelRegionComponent,
  type PerfBand,
  PerfGraphComponent,
  PopoverDirective,
  PopoverPanelComponent,
  PresenceFlagComponent,
  PresenceLayerComponent,
  type PresenceMark,
  RailComponent,
  RatingComponent,
  ReadoutComponent,
  SearchComponent,
  SectionComponent,
  SegmentedComponent,
  SelectComponent,
  SettingRowComponent,
  SettingsGroupComponent,
  ShareCodeComponent,
  SkeletonComponent,
  SliderComponent,
  type SlotCell,
  SlotGridComponent,
  StatComponent,
  StepperComponent,
  SwatchPickerComponent,
  TableDirective,
  TabsComponent,
  TagInputComponent,
  ToastService,
  ToggleButtonComponent,
  ToggleComponent,
  ToolGroupComponent,
  TooltipDirective,
  TransportComponent,
} from '@naucto/ui';

import { OAUTH_PROVIDERS } from '../../core/auth/oauth/providers';
import { ThemeService } from '../../core/theme/theme.service';
import { DiskNameComponent } from '../../shared/game-card/disk-name.component';
import type { DiskStyle } from '../../shared/game-card/disk-style';
import { FloppyComponent, type FloppySticker } from '../../shared/game-card/floppy.component';
import { ACCENT_SLOTS } from '../editor/accent-slots';
import { HubPiecesSection } from './hub-pieces.section';

/** Dev-only gallery of every UI primitive, used for visual goldens in light and dark. */
@Component({
  selector: 'nc-ui-kit-page',
  imports: [
    HubPiecesSection,
    DiskNameComponent,
    FloppyComponent,
    ArrowLinkDirective,
    AvatarComponent,
    BitFlagsComponent,
    ButtonDirective,
    CheckboxComponent,
    ChipComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    FieldComponent,
    IconComponent,
    MarkComponent,
    MediaActionDirective,
    MediaFrameComponent,
    SwatchPickerComponent,
    PanelRegionComponent,
    PanelColumnComponent,
    EdgeHandleComponent,
    InputDirective,
    JoinedDirective,
    KeycapComponent,
    PadCapComponent,
    LabelComponent,
    NoticeComponent,
    LcdComponent,
    LogoComponent,
    MeterComponent,
    PerfGraphComponent,
    OnlineDotComponent,
    PresenceFlagComponent,
    PresenceLayerComponent,
    RailComponent,
    SectionComponent,
    BrandMarkComponent,
    SegmentedComponent,
    SelectComponent,
    SkeletonComponent,
    SliderComponent,
    TableDirective,
    TabsComponent,
    ToggleComponent,
    StepperComponent,
    ToolGroupComponent,
    ToggleButtonComponent,
    ShareCodeComponent,
    SettingRowComponent,
    SettingsGroupComponent,
    HelpDotComponent,
    HighlightComponent,
    ReadoutComponent,
    PopoverDirective,
    PopoverPanelComponent,
    DialogShellComponent,
    DisclosureComponent,
    OptionDirective,
    PagerComponent,
    SearchComponent,
    StatComponent,
    TagInputComponent,
    NumberFieldComponent,
    TooltipDirective,
    RatingComponent,
    SlotGridComponent,
    TransportComponent,
  ],
  templateUrl: './ui-kit.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class UiKitPage {
  protected readonly palette = [...BUBBLEGUM_16];
  protected readonly accents = ACCENT_SLOTS;
  protected readonly swatch = signal<number | null>(4);
  protected readonly regionOpen = signal(true);
  protected readonly hidden = signal<ReadonlySet<string>>(new Set());
  private readonly dialogs = inject(DialogService);
  private readonly toasts = inject(ToastService);
  private readonly document = inject(DOCUMENT);
  protected readonly themeService = inject(ThemeService);
  protected readonly providers = inject(OAUTH_PROVIDERS);
  protected readonly autoRun = signal(true);
  protected readonly tags = signal(['action', 'adventure']);
  protected readonly maxPlayers = signal(4);
  protected readonly tempo = signal(120);
  protected readonly keys = ['Arrows', 'Z', 'X', 'Esc'];
  protected readonly padDirections: PadDirection[] = ['left', 'right', 'up', 'down'];
  protected readonly spriteSize = signal(1);
  protected readonly presenceFrame = { x: 0, y: 0, w: 320, h: 120 };
  protected readonly presenceMarks: PresenceMark[] = [
    { id: 1, name: 'thea', colour: 'jade', x: 120, y: 40 },
    { id: 2, name: 'louis', colour: 'sky', x: 900, y: 70 },
    { id: 3, name: 'edgar', colour: 'blush', x: 60, y: -400 },
  ];
  protected readonly sizes = ['1×1', '2×2', '4×4', '8×8'];
  protected readonly tableActions: {
    name: string;
    hint?: string;
    key: string;
    arrow?: MarkName;
    pad: string;
  }[] = [
    { name: 'Move left', key: 'A', arrow: 'arrow-left', pad: 'D-pad' },
    { name: 'Jump', hint: 'Hold to jump higher', key: 'Space', arrow: 'arrow-up', pad: 'A' },
    { name: 'Dash', hint: 'A burst of speed, once per jump', key: 'Shift', pad: 'X' },
    { name: 'Pause', key: 'Esc', pad: 'Start' },
  ];
  protected readonly tool = signal('pen');
  protected readonly tools = [
    { value: 'pen', icon: 'edit' as const, label: 'Pen' },
    { value: 'fill', icon: 'paint-bucket' as const, label: 'Fill' },
    { value: 'line', icon: 'line' as const, label: 'Line' },
    { value: 'rect', icon: 'frame' as const, label: 'Rect' },
  ];
  protected readonly grid = signal(true);
  protected readonly onion = signal(false);
  protected readonly haptics = signal(false);
  protected readonly regexp = signal(false);
  protected readonly visibilityValue = signal('draft');
  protected readonly monetizationValue = signal('none');
  protected readonly genre = signal<string | undefined>(undefined);
  protected readonly bpm = signal(124);
  protected readonly red = signal(255);
  protected readonly paletteSlots = this.palette.map((_, slot) => slot);
  protected readonly colour = signal<number | null>(13);
  protected readonly bits = signal(5);
  protected readonly score = signal<number | null>(8);
  protected readonly playing = signal(false);
  protected readonly slot = signal(2);
  protected readonly slotCells = computed<SlotCell[]>(() =>
    Array.from({ length: 16 }, (_, i) => ({
      n: i,
      state: i === this.slot() ? 'current' : i < 6 ? 'filled' : 'empty',
    })),
  );
  protected readonly sections = [
    { id: 'foundations', label: 'Foundations' },
    { id: 'buttons', label: 'Buttons' },
    { id: 'inputs', label: 'Inputs' },
    { id: 'selection', label: 'Selection' },
    { id: 'chips', label: 'Chips & data' },
    { id: 'table', label: 'Table' },
    { id: 'navigation', label: 'Navigation' },
    { id: 'feedback', label: 'Feedback' },
    { id: 'overlays', label: 'Overlays' },
    { id: 'cards', label: 'Game card' },
    { id: 'hub', label: 'Hub pieces' },
  ];
  /** A cover that needs no server: a sun going down over the sea, sixteen pixels wide. */
  protected readonly diskCover =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 9' shape-rendering='crispEdges'%3E%3Cpath fill='%23430067' d='M0 0h16v9H0z'/%3E%3Cpath fill='%2394216a' d='M0 3h16v3H0z'/%3E%3Cpath fill='%23ff8426' d='M0 5h16v1H0z'/%3E%3Cpath fill='%23ffd100' d='M6 3h4v1H6zM5 4h6v2H5z'/%3E%3Cpath fill='%23234975' d='M0 6h16v3H0z'/%3E%3Cpath fill='%2368aed4' d='M5 6h6v1H5zM7 7h3v1H7zM2 7h2v1H2zM12 8h3v1h-3z'/%3E%3C/svg%3E";
  protected readonly striped: DiskStyle = { color: BUBBLEGUM_16[6], finish: 'stripes' };
  protected readonly checkered: DiskStyle = { color: BUBBLEGUM_16[12], finish: 'checker' };
  protected readonly dotted: DiskStyle = { color: BUBBLEGUM_16[13], finish: 'dots' };
  protected readonly twoTone: DiskStyle = {
    color: BUBBLEGUM_16[3],
    finish: 'stripes',
    color2: BUBBLEGUM_16[4],
  };
  protected readonly diagonal: DiskStyle = {
    color: BUBBLEGUM_16[3],
    finish: 'gradient',
    color2: BUBBLEGUM_16[7],
    gradDir: 'd',
  };
  protected readonly finishes: { name: string; disk: DiskStyle }[] = [
    { name: 'Solid', disk: { color: BUBBLEGUM_16[11], finish: 'solid' } },
    { name: 'Stripes', disk: this.striped },
    { name: 'Checker', disk: this.checkered },
    { name: 'Dots', disk: this.dotted },
    { name: 'Two colours', disk: this.twoTone },
    { name: 'Gold', disk: { color: BUBBLEGUM_16[4], finish: 'gold' } },
    { name: 'Silver', disk: { color: BUBBLEGUM_16[5], finish: 'silver' } },
    { name: 'Holo', disk: { color: BUBBLEGUM_16[5], finish: 'holo' } },
    {
      name: 'Across',
      disk: { color: BUBBLEGUM_16[14], finish: 'gradient', color2: BUBBLEGUM_16[11], gradDir: 'h' },
    },
    {
      name: 'Down',
      disk: { color: BUBBLEGUM_16[10], finish: 'gradient', color2: BUBBLEGUM_16[9], gradDir: 'v' },
    },
    { name: 'Diagonal', disk: this.diagonal },
    {
      name: 'Other diagonal',
      disk: { color: BUBBLEGUM_16[7], finish: 'gradient', color2: BUBBLEGUM_16[4], gradDir: 'd2' },
    },
    {
      name: 'Outward',
      disk: { color: BUBBLEGUM_16[12], finish: 'gradient', color2: BUBBLEGUM_16[13], gradDir: 'r' },
    },
  ];
  protected readonly seated = signal(false);
  /** A host, two players, those who did not fit, and the open seat the visitor takes. */
  protected readonly stickers = computed<FloppySticker[]>(() => [
    { x: 13, y: 14, rotation: -8, initial: 'L', color: BUBBLEGUM_16[11], host: true },
    { x: 87, y: 15, rotation: 11, initial: 'E', color: BUBBLEGUM_16[6] },
    { x: 9, y: 52, rotation: 6, initial: 'T', color: BUBBLEGUM_16[12] },
    { x: 91, y: 49, rotation: -12, initial: '+3', color: 'var(--color-key-lit)' },
    { x: 29, y: 34, rotation: 4, seat: true, hidden: this.seated() },
    { x: 29, y: 34, rotation: 4, initial: 'Y', color: BUBBLEGUM_16[4], hidden: !this.seated() },
    { x: 72, y: 33, rotation: -5, seat: true },
  ]);
  protected readonly surfaces = [
    { name: 'page', fill: 'bevel-fill-page' },
    { name: 'panel', fill: 'bevel-fill-panel' },
    { name: 'raised', fill: 'bevel-fill-raised' },
    { name: 'inset', fill: 'bevel-fill-inset' },
    { name: 'line', fill: 'bevel-fill-line-strong' },
  ];
  protected readonly accentSwatches = [
    { name: 'gold', fill: 'bg-gold text-on-accent', ink: 'text-gold-ink' },
    { name: 'hot', fill: 'bg-hot text-on-hot', ink: 'text-hot-ink' },
    { name: 'jade', fill: 'bg-jade text-on-accent', ink: 'text-jade-ink' },
    { name: 'sky', fill: 'bg-sky text-on-accent', ink: 'text-sky-ink' },
    { name: 'orange', fill: 'bg-orange text-on-accent', ink: 'text-orange-ink' },
  ];
  protected readonly washes = [
    { name: 'gold', fill: 'bevel-fill-gold-wash', ink: 'text-gold-ink' },
    { name: 'hot', fill: 'bevel-fill-hot-wash', ink: 'text-hot-ink' },
    { name: 'jade', fill: 'bevel-fill-jade-wash', ink: 'text-jade-ink' },
    { name: 'sky', fill: 'bevel-fill-sky-wash', ink: 'text-sky-ink' },
  ];
  protected readonly inks = [
    { name: 'ink', ink: 'text-ink' },
    { name: 'body', ink: 'text-ink-body' },
    { name: 'ink-2', ink: 'text-ink-2' },
    { name: 'ink-3', ink: 'text-ink-3' },
    { name: 'ink-4', ink: 'text-ink-4' },
    { name: 'active', ink: 'text-active-ink' },
  ];
  protected readonly scale = [
    { px: 40, name: 'control' },
    { px: 30, name: 'small' },
    { px: 48, name: 'bar' },
    { px: 56, name: 'hero' },
    { px: 24, name: 'icon' },
  ];
  protected readonly dithers = [
    'var(--nc-dither-12)',
    'var(--nc-dither-25)',
    'var(--nc-dither-37)',
    'var(--nc-dither-50)',
    'var(--nc-dither-75)',
    'var(--nc-dither-87)',
  ];
  protected readonly buttonSizes = [
    { size: 'xs', label: 'xs 28' },
    { size: 'sm', label: 'sm 30' },
    { size: 'md', label: 'md 36' },
    { size: 'lg', label: 'lg 40' },
    { size: 'xl', label: 'xl 44' },
    { size: 'bar', label: 'bar 48' },
  ] as const;
  protected readonly versionsOpen = signal(false);
  protected readonly copied = signal(false);
  protected readonly reduceMotion = signal(false);
  protected readonly matchCase = signal(true);
  protected readonly themes = [
    { value: 'dark', label: 'Dark' },
    { value: 'light', label: 'Light' },
  ] as const;
  protected readonly visibility = [
    { value: 'draft', label: 'Draft' },
    { value: 'unlisted', label: 'Unlisted' },
    { value: 'public', label: 'Public' },
  ];
  protected readonly monetization = [
    { value: 'none', label: 'None' },
    { value: 'tips', label: 'Tips' },
    { value: 'paid', label: 'Paid' },
  ];
  protected readonly consoleTabs = [
    { value: 'console', label: 'Console', mark: 'prompt' as const },
    { value: 'doc', label: 'Doc' },
    { value: 'perf', label: 'Perf', mark: 'chart' as const },
  ];
  protected readonly genres = [
    { value: 'arcade', label: 'Arcade' },
    { value: 'platformer', label: 'Platformer' },
    { value: 'puzzle', label: 'Puzzle' },
    { value: 'racing', label: 'Racing' },
    { value: 'rpg', label: 'Role-playing' },
    { value: 'shooter', label: 'Shooter' },
  ];
  protected readonly shelves = [
    { value: 'games', label: 'Games' },
    { value: 'people', label: 'People' },
    { value: 'tags', label: 'Tags' },
  ];
  protected readonly tabs = [
    { value: 'account', label: 'Account' },
    { value: 'editor', label: 'Editor' },
    { value: 'controls', label: 'Controls' },
    { value: 'privacy', label: 'Privacy', badge: 2 },
  ] as const;
  protected readonly rail = [
    { value: 'art', label: 'Art', icon: 'image' },
    { value: 'code', label: 'Code', icon: 'code' },
    { value: 'map', label: 'Map', icon: 'map' },
    { value: 'sound', label: 'Sound', icon: 'music' },
    { value: 'game', label: 'Game', icon: 'gamepad' },
  ] as const;
  protected readonly railTab = signal<'art' | 'code' | 'map' | 'sound' | 'game'>('art');
  protected readonly railCopy = {
    art: { title: '8×8 sprites', body: 'Draw tiles and characters on the shared sheet.' },
    code: { title: 'main.lua', body: 'Lua, with the engine reference one key away.' },
    map: { title: 'Level 1, 32×18', body: 'Lay the sheet out into rooms.' },
    sound: { title: '4 instruments', body: 'Waves, envelopes and the piano roll.' },
    game: { title: 'Hightide v3', body: 'Title, cover, inputs and publishing.' },
  };
  protected readonly pageTab = signal<'account' | 'editor' | 'controls' | 'privacy'>('account');
  protected readonly tabCopy = {
    account: {
      title: 'Signed in as Louis',
      body: 'Your handle shows on every game you publish.',
    },
    editor: { title: 'Indent with 2 spaces', body: 'Applies to every file you open.' },
    controls: {
      title: 'Gamepad 1, Xbox layout',
      body: 'The gamepad and the touch pad of this device.',
    },
    privacy: { title: 'Two things to review', body: 'What is collected, and what you can erase.' },
  };
  protected readonly consoleTab = signal<string | undefined>('console');
  protected readonly shelf = signal<string | undefined>('games');
  protected readonly page = signal(0);
  protected readonly topLinks = ['Hub', 'My games', 'Friends', 'Learn'];
  protected readonly tooltipMeta = ['Visible to everyone', 'Built 2 min ago'];
  protected readonly frictions = ['Plain', 'Password', 'Type the name', 'Hold'] as const;
  protected readonly notifications = [
    {
      title: 'theo joined Hightide',
      body: 'Editing main.lua with you right now.',
      when: '2 min ago',
      unread: true,
    },
    {
      title: 'Starline is over 1 MB',
      body: 'Publishing is blocked until it shrinks.',
      when: 'Yesterday',
      unread: false,
    },
  ];
  protected readonly size = [
    { label: 'Sprites 612 KB', value: 612 * 1024, color: 'bg-sky' },
    { label: 'Music 214 KB', value: 214 * 1024, color: 'bg-hot' },
    { label: 'Map 88 KB', value: 88 * 1024, color: 'bg-jade' },
    { label: 'Code 28 KB', value: 28 * 1024, color: 'bg-gold' },
  ];
  /** A minute of readings: steady, a dip into each band, then a climb past the ceiling. */
  protected readonly perfFps = Array.from({ length: 96 }, (_, i) =>
    i > 30 && i < 38 ? 44 : i > 60 && i < 64 ? 24 : 60 - (i % 7 === 0 ? 2 : 0),
  );
  protected readonly perfCpu = Array.from({ length: 96 }, (_, i) =>
    Math.min(98, 32 + (i % 9) * 2 + Math.max(0, i - 70) * 2.4),
  );
  protected readonly perfFpsBands: PerfBand[] = [
    { from: Number.NEGATIVE_INFINITY, to: 30, tone: 'over' },
    { from: 30, to: 54, tone: 'warn' },
    { from: 54, to: Number.POSITIVE_INFINITY, tone: 'ok' },
  ];
  protected readonly perfCpuBands: PerfBand[] = [
    { from: Number.NEGATIVE_INFINITY, to: 70, tone: 'ok' },
    { from: 70, to: 90, tone: 'warn' },
    { from: 90, to: Number.POSITIVE_INFINITY, tone: 'over' },
  ];
  protected readonly marks = Object.keys(MARK_GLYPHS) as MarkName[];
  protected readonly icons = Object.keys(ICON_GLYPHS[24]) as IconName[];

  /** The router restores the scroll position on every navigation and follows no fragment. */
  protected jump(event: Event, id: string): void {
    event.preventDefault();
    this.document.getElementById(id)?.scrollIntoView();
  }

  /** The four levels of friction, matched to how much there is to lose. */
  protected async ask(level: 'Plain' | 'Password' | 'Type the name' | 'Hold'): Promise<void> {
    let done: boolean;
    switch (level) {
      case 'Plain':
        done = await this.dialogs.confirmDanger({
          kicker: 'Unsaved changes',
          title: 'Discard your changes?',
          message:
            'Your last 4 edits to main.lua have not synced. Discarding drops them for everyone in the session.',
          cancelLabel: 'Keep editing',
          confirmLabel: 'Discard',
        });
        break;
      case 'Password': {
        const password = await this.dialogs.confirmWithPassword(
          {
            kicker: 'Delete account',
            title: 'Delete your account?',
            message: [
              'Your games, sprites and comments are removed for good. Remixes other people made stay up, credited to a deleted user.',
              'This cannot be undone.',
            ],
            confirmLabel: 'Delete',
            danger: true,
          },
          'Password',
        );
        done = password !== null;
        break;
      }
      case 'Type the name':
        done = await this.dialogs.confirmDanger({
          kicker: 'Delete game',
          title: 'Delete Hightide?',
          message:
            'All published versions and its 318 likes go with it. Forks stay — they belong to their makers.',
          confirmLabel: 'Delete game',
          friction: { kind: 'name', name: 'Hightide', label: 'Type Hightide to confirm' },
        });
        break;
      case 'Hold':
        done = await this.dialogs.confirmDanger({
          kicker: 'End session',
          title: 'Kick everyone out?',
          message:
            'Three players are still in. They will see the lobby close and lose unsaved progress.',
          cancelLabel: 'Keep going',
          confirmLabel: 'Hold to end',
          friction: {
            kind: 'hold',
            holdingLabel: 'Keep holding…',
            hint: 'Hold Space or Enter for 1.2 seconds',
          },
        });
        break;
    }
    this.toasts.show(done ? 'Done' : 'Cancelled — nothing changed', done ? 'success' : 'info');
  }

  protected toast(): void {
    this.toasts.show('Saved 2 minutes ago — 942 KB', 'success');
  }

  protected toastTitled(): void {
    this.toasts.show('The release could not be reached.', 'error', 6000, 'Could not save');
  }

  protected hide(notice: string): void {
    this.hidden.update((hidden) => new Set(hidden).add(notice));
  }

  protected applyTheme(theme: 'dark' | 'light' | undefined): void {
    if (theme) {
      this.themeService.theme.set(theme);
    }
  }
}
