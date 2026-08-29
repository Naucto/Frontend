import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { inject } from '@angular/core';
import {
  AvatarComponent,
  BitFlagsComponent,
  BrandMarkComponent,
  ButtonDirective,
  ChipComponent,
  ConfirmDialogComponent,
  DialogService,
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
  OnlineDotComponent,
  PanelComponent,
  PopoverDirective,
  PopoverPanelComponent,
  PresenceFlagComponent,
  RailComponent,
  SearchComponent,
  SectionComponent,
  SegmentedComponent,
  SkeletonComponent,
  SliderComponent,
  StatComponent,
  TabsComponent,
  TagInputComponent,
  ToastHostComponent,
  ToastService,
  ToggleComponent,
  TooltipDirective,
} from '@naucto/ui';

/** Dev-only gallery of every UI primitive, used for visual goldens in light and dark. */
@Component({
  selector: 'nc-ui-kit-page',
  imports: [
    AvatarComponent,
    BitFlagsComponent,
    ButtonDirective,
    ChipComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    FieldComponent,
    IconComponent,
    InputDirective,
    KeycapComponent,
    LabelComponent,
    LcdComponent,
    MeterComponent,
    OnlineDotComponent,
    PanelComponent,
    PresenceFlagComponent,
    RailComponent,
    SectionComponent,
    BrandMarkComponent,
    SegmentedComponent,
    SkeletonComponent,
    SliderComponent,
    TabsComponent,
    ToggleComponent,
    HelpDotComponent,
    PopoverDirective,
    PopoverPanelComponent,
    SearchComponent,
    StatComponent,
    TagInputComponent,
    ToastHostComponent,
    TooltipDirective,
  ],
  template: `
    <nc-toast-host />
    <div class="mx-auto grid max-w-[1100px] gap-4 p-6">
      <header class="flex items-end justify-between">
        <div>
          <h1 class="text-hero text-ink">Naucto UI kit</h1>
          <p class="text-body text-ink-2">
            Every primitive on the 8px grid, HD44780 + Pixelarticons.
          </p>
        </div>
        <nc-segmented
          [options]="themes"
          [(value)]="theme"
          (valueChange)="applyTheme($event)"
          label="Theme"
        />
      </header>

      <nc-panel title="Controls">
        <div class="flex flex-wrap items-center gap-2">
          <button ncButton variant="primary">Publish</button>
          <button ncButton variant="run">
            <nc-icon name="play" [size]="12" />
            Run
          </button>
          <button ncButton variant="secondary">Secondary</button>
          <button ncButton variant="ghost">Ghost</button>
          <button ncButton variant="danger">Delete</button>
          <button ncButton variant="secondary" size="sm">Small</button>
          <button ncButton variant="ghost" iconOnly aria-label="Settings">
            <nc-icon name="sliders" />
          </button>
          <button ncButton variant="primary" disabled>Disabled</button>
        </div>
        <div class="mt-2 flex flex-wrap items-center gap-2">
          <nc-toggle [(checked)]="autoRun">Auto-run</nc-toggle>
          <nc-toggle>Haptics</nc-toggle>
          <nc-segmented [options]="visibility" value="draft" label="Visibility" />
          <nc-segmented [options]="monetization" value="none" label="Monetization" fill />
          <nc-segmented [options]="shelves" value="games" label="Shelf" variant="chips" />
          <nc-slider
            label="BPM"
            [min]="40"
            [max]="240"
            [value]="124"
            readout="124"
            class="w-[220px]"
          />
          <nc-slider
            label="R"
            [max]="255"
            [value]="255"
            readout="255"
            accent="hot"
            class="w-[220px]"
          />
        </div>
        <div class="mt-2 flex flex-wrap items-center gap-2">
          <nc-bit-flags [value]="5" />
          <nc-brand-mark name="google" [size]="16" />
          <nc-brand-mark name="github" [size]="16" />
          <nc-brand-mark name="microsoft" [size]="16" />
          <nc-keycap>Arrows</nc-keycap>
          <nc-keycap>Z</nc-keycap>
          <nc-keycap>Esc</nc-keycap>
          <nc-keycap>D-pad</nc-keycap>
          <nc-chip>Action</nc-chip>
          <nc-chip tone="gold" [removable]="true">Adventure</nc-chip>
          <nc-chip tone="jade">Synced</nc-chip>
          <nc-chip tone="sky">Netplay</nc-chip>
          <nc-chip tone="hot">Draft</nc-chip>
          <nc-chip tone="orange">Warning</nc-chip>
        </div>
      </nc-panel>

      <div class="grid grid-cols-[48px_1fr_1fr] gap-4">
        <nc-rail [items]="rail" value="code" class="h-[320px]" />
        <nc-panel title="Fields">
          <div class="grid gap-2">
            <nc-field label="Name" for="f-name">
              <input ncInput id="f-name" value="Platformer" />
            </nc-field>
            <nc-field
              label="Summary"
              for="f-sum"
              counter="38 / 80"
              hint="One line shown on the hub card."
            >
              <input ncInput id="f-sum" value="A tiny run-and-jump built as a tutorial." />
            </nc-field>
            <nc-field label="Description" for="f-desc" error="Required before publishing">
              <textarea
                ncInput
                id="f-desc"
                rows="3"
                placeholder="The long version. Markdown is fine."
                aria-invalid="true"
              ></textarea>
            </nc-field>
            <nc-tabs [tabs]="tabs" value="account" label="Settings" />
            <nc-tabs [tabs]="consoleTabs" value="console" label="Console" variant="console" />
          </div>
        </nc-panel>
        <nc-panel title="Surfaces">
          <nc-section title="Game size">
            <nc-meter [segments]="size" [max]="1048576" label="Game size" />
          </nc-section>
          <nc-section title="Console" class="mt-2">
            <nc-lcd [minHeight]="72">
              &gt; RUN main.lua &gt; Welcome to Naucto! ! main.lua:39 attempt to index a nil value
              (field 'sprites')
            </nc-lcd>
            <nc-lcd variant="flush" [minHeight]="48" class="mt-1">
              &gt; flush: the console fills its column, no frame
            </nc-lcd>
          </nc-section>
          <nc-section title="Loading" class="mt-2">
            <div class="grid gap-1">
              <nc-skeleton height="96px" radius="rounded-sm" />
              <nc-skeleton height="0.75rem" width="60%" />
              <nc-skeleton height="0.75rem" width="35%" />
            </div>
          </nc-section>
          <nc-section title="Presence" class="mt-2">
            <div class="flex items-center gap-2">
              <nc-avatar name="louis" [size]="38" overlap />
              <nc-avatar name="edgar" [size]="38" overlap />
              <nc-avatar name="thea" [size]="38" overlap />
              <nc-avatar name="alexis" colour="neutral" [size]="38" />
              <nc-presence-flag name="louis" colour="sky" />
              <nc-presence-flag name="edgar" colour="blush" />
              <nc-online-dot [online]="true" />
              <nc-online-dot />
            </div>
          </nc-section>
          <nc-section title="Label" class="mt-2">
            <nc-label>In this work session</nc-label>
          </nc-section>
        </nc-panel>
      </div>

      <nc-panel title="Overlays &amp; inputs">
        <div class="flex flex-wrap items-center gap-2">
          <button ncButton variant="secondary" ncTooltip="Kick this player from the session">
            Hover me
          </button>
          <button ncButton variant="secondary" [ncPopover]="versions">Platformer v3 ▾</button>
          <ng-template #versions>
            <nc-popover-panel title="Versions">
              <ul class="p-2 text-body text-ink">
                <li class="flex justify-between">
                  <span>v3 Cave update</span>
                  <nc-chip tone="gold">Current</nc-chip>
                </li>
                <li class="mt-1 text-ink-3">Autosave · 8 minutes ago · you</li>
              </ul>
            </nc-popover-panel>
          </ng-template>
          <button ncButton variant="danger" (click)="confirm()">End session</button>
          <button ncButton variant="ghost" (click)="toast()">Toast</button>
          <nc-help-dot
            text="Eight bits per sprite. The engine ignores them — your game reads them."
          />
          <nc-search class="w-[280px]" placeholder="Search games, people, tags…" />
          <nc-tag-input class="w-[320px]" [tags]="['action', 'adventure']" />
          <nc-stat icon="play" [value]="40" />
          <nc-stat icon="heart" [value]="1008" tone="hot" />
          <nc-stat icon="git-branch" [value]="3" />
          <nc-stat icon="eye" [value]="48" label="Views" />
          <nc-stat icon="play" [value]="1247" label="Plays" compact />
          <nc-stat icon="heart" [value]="318" label="Likes" tone="hot" />
        </div>
      </nc-panel>

      <nc-panel>
        <nc-empty-state
          icon="music"
          title="No sound yet"
          hint="An instrument is a wave plus an envelope. Add one and the piano roll wakes up — five voices, sixteen slots."
        >
          <button ncButton variant="primary">+ Add instrument</button>
        </nc-empty-state>
      </nc-panel>

      <nc-panel>
        <nc-error-state
          title="Could not reach the hub"
          hint="The request failed. This is not the same as there being nothing here — an outage must never read as an empty shelf."
          retryLabel="Retry"
        />
      </nc-panel>

      <nc-panel title="Icons">
        <div class="flex flex-wrap gap-1 text-ink-2">
          @for (i of icons; track i) {
            <span
              class="flex h-5 w-5 items-center justify-center rounded-xs border border-line"
              [title]="i"
            >
              <nc-icon [name]="i" />
            </span>
          }
        </div>
      </nc-panel>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiKitPage {
  private readonly dialogs = inject(DialogService);
  private readonly toasts = inject(ToastService);
  protected readonly autoRun = signal(true);
  protected readonly theme = signal<'dark' | 'light'>('dark');
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
          message: 'Everyone is disconnected and the slots are freed. The game keeps its state.',
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

  protected applyTheme(t: 'dark' | 'light' | undefined): void {
    if (t) document.documentElement.dataset.theme = t;
  }
}
