import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { inject } from '@angular/core';
import { BUBBLEGUM_16 } from '@naucto/engine';
import {
  AvatarComponent,
  BitFlagsComponent,
  BrandMarkComponent,
  ButtonDirective,
  CheckboxComponent,
  ChipComponent,
  ConfirmDialogComponent,
  DialogService,
  EdgeHandleComponent,
  EmptyStateComponent,
  ErrorStateComponent,
  FieldComponent,
  HelpDotComponent,
  IconComponent,
  InputDirective,
  KeycapComponent,
  LabelComponent,
  LcdComponent,
  MeterComponent,
  NoticeComponent,
  OnlineDotComponent,
  PanelColumnComponent,
  PanelComponent,
  PanelRegionComponent,
  PopoverDirective,
  PopoverPanelComponent,
  PresenceFlagComponent,
  PresenceLayerComponent,
  type PresenceMark,
  RailComponent,
  SearchComponent,
  SectionComponent,
  SegmentedComponent,
  SettingRowComponent,
  ShareCodeComponent,
  SkeletonComponent,
  SliderComponent,
  StatComponent,
  StepperComponent,
  SwatchPickerComponent,
  TabsComponent,
  TagInputComponent,
  ToastService,
  ToggleButtonComponent,
  ToggleComponent,
  ToolGroupComponent,
  TooltipDirective,
} from '@naucto/ui';

import { OAUTH_PROVIDERS } from '../../core/auth/oauth/providers';
import { ThemeService } from '../../core/theme/theme.service';
import { ACCENT_SLOTS } from '../editor/accent-slots';

/** Dev-only gallery of every UI primitive, used for visual goldens in light and dark. */
@Component({
  selector: 'nc-ui-kit-page',
  imports: [
    AvatarComponent,
    BitFlagsComponent,
    ButtonDirective,
    CheckboxComponent,
    ChipComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    FieldComponent,
    IconComponent,
    SwatchPickerComponent,
    PanelRegionComponent,
    PanelColumnComponent,
    EdgeHandleComponent,
    InputDirective,
    KeycapComponent,
    LabelComponent,
    NoticeComponent,
    LcdComponent,
    MeterComponent,
    OnlineDotComponent,
    PanelComponent,
    PresenceFlagComponent,
    PresenceLayerComponent,
    RailComponent,
    SectionComponent,
    BrandMarkComponent,
    SegmentedComponent,
    SkeletonComponent,
    SliderComponent,
    TabsComponent,
    ToggleComponent,
    StepperComponent,
    ToolGroupComponent,
    ToggleButtonComponent,
    ShareCodeComponent,
    SettingRowComponent,
    HelpDotComponent,
    PopoverDirective,
    PopoverPanelComponent,
    SearchComponent,
    StatComponent,
    TagInputComponent,
    TooltipDirective,
  ],
  templateUrl: './ui-kit.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class UiKitPage {
  protected readonly palette = [...BUBBLEGUM_16];
  protected readonly accents = ACCENT_SLOTS;
  protected readonly swatch = signal<number | null>(4);
  protected readonly regionOpen = signal(true);
  private readonly dialogs = inject(DialogService);
  private readonly toasts = inject(ToastService);
  protected readonly themeService = inject(ThemeService);
  protected readonly providers = inject(OAUTH_PROVIDERS);
  protected readonly autoRun = signal(true);
  protected readonly spriteSize = signal(1);
  protected readonly presenceFrame = { x: 0, y: 0, w: 320, h: 120 };
  protected readonly presenceMarks: PresenceMark[] = [
    { id: 1, name: 'thea', colour: 'jade', x: 120, y: 40 },
    { id: 2, name: 'louis', colour: 'sky', x: 900, y: 70 },
    { id: 3, name: 'edgar', colour: 'blush', x: 60, y: -400 },
  ];
  protected readonly sizes = ['1×1', '2×2', '3×3', '4×4', '5×5', '6×6', '7×7', '8×8'];
  protected readonly tool = signal('pen');
  protected readonly tools = [
    { value: 'pen', icon: 'sliders' as const, label: 'Pen' },
    { value: 'fill', icon: 'paint-bucket' as const, label: 'Fill' },
    { value: 'line', icon: 'line' as const, label: 'Line' },
    { value: 'rect', icon: 'frame' as const, label: 'Rect' },
  ];
  protected readonly grid = signal(true);
  /** The two densities a bar may ask for, and the glyph step each one takes. */
  protected readonly densities = [
    { name: 'Small — the drawn size', klass: 'nc-density-small', icon: 12 as const },
    { name: 'Big — the editor strips', klass: 'nc-density-big', icon: 24 as const },
  ];
  protected readonly reduceMotion = signal(false);
  protected readonly matchCase = signal(true);
  protected readonly themes = [
    { value: 'dark', label: 'Dark' },
    { value: 'light', label: 'Light' },
  ] as const;
  protected readonly visibility = [
    { value: 'draft', label: 'Draft' },
    { value: 'public', label: 'Public' },
  ];
  protected readonly monetization = [
    { value: 'none', label: 'None' },
    { value: 'ads', label: 'Ads' },
    { value: 'paid', label: 'Paid' },
  ];
  protected readonly consoleTabs = [
    { value: 'console', label: 'Console', icon: 'command' as const },
    { value: 'doc', label: 'Doc', icon: 'file' as const },
    { value: 'perf', label: 'Perf', icon: 'chart' as const },
  ];
  protected readonly shelves = [
    { value: 'games', label: 'Games 7' },
    { value: 'liked', label: 'Liked 12' },
    { value: 'collabs', label: 'Collabs 3' },
  ];
  protected readonly tabs = [
    { value: 'account', label: 'Account' },
    { value: 'editor', label: 'Editor' },
    { value: 'controls', label: 'Controls' },
    { value: 'privacy', label: 'Privacy', badge: 2 },
  ];
  protected readonly rail = [
    { value: 'game', label: 'Game', icon: 'save' },
    { value: 'code', label: 'Code', icon: 'code' },
    { value: 'art', label: 'Art', icon: 'image' },
    { value: 'map', label: 'Map', icon: 'map' },
    { value: 'sound', label: 'Sound', icon: 'music' },
    { value: 'net', label: 'Net', icon: 'users' },
  ] as const;
  protected readonly size = [
    { label: 'Sprites 612 KB', value: 612 * 1024, color: 'bg-sky' },
    { label: 'Music 214 KB', value: 214 * 1024, color: 'bg-hot' },
    { label: 'Map 88 KB', value: 88 * 1024, color: 'bg-jade' },
    { label: 'Code 28 KB', value: 28 * 1024, color: 'bg-gold' },
  ];
  protected readonly icons = [
    'save',
    'code',
    'image',
    'map',
    'music',
    'users',
    'play',
    'pause',
    'reload',
    'home',
    'search',
    'menu',
    'heart',
    'eye',
    'message',
    'check',
    'alert',
    'warning-box',
    'user',
    'notification',
    'trophy',
    'info-box',
    'bug',
    'debug',
    'flag',
    'label',
    'clock',
    'zap',
    'lock',
    'sync',
    'github',
    'trash',
    'duplicate',
    'git-branch',
    'gamepad',
    'keyboard',
    'device-phone',
    'zoom-in',
    'zoom-out',
    'move',
    'flip-horizontal',
    'flip-vertical',
    'rotate-cw',
    'frame',
    'grid',
    'paint-bucket',
    'drop',
    'sliders',
    'external-link',
    'expand',
    'collapse',
    'close',
    'plus',
    'chevron-down',
    'arrow-right',
    'more-horizontal',
  ] as const;

  protected confirm(): void {
    this.dialogs
      .open<ConfirmDialogComponent, unknown, boolean>(ConfirmDialogComponent, {
        data: {
          title: 'End session',
          message: [
            'Everyone is disconnected and the slots are freed.',
            'The game keeps its state.',
          ],
          confirmLabel: 'End session',
          danger: true,
        },
      })
      .closed.subscribe((ok) => {
        this.toasts.show(ok ? 'Session ended' : 'Kept the session', ok ? 'success' : 'info');
      });
  }

  protected toast(): void {
    this.toasts.show('Saved 2 minutes ago — 942 KB', 'success');
  }

  protected applyTheme(theme: 'dark' | 'light' | undefined): void {
    if (theme) {
      this.themeService.theme.set(theme);
    }
  }
}
