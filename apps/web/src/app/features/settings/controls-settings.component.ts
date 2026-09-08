import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { InputBindingsStore } from '@app/core/input/input-bindings.store';
import { PadSettingsStore } from '@app/shared/game-screen/pad-settings.store';
import { TranslocoDirective } from '@jsverse/transloco';
import { type Action, ACTIONS, type DeclaredAction, type GamepadButtonRef } from '@naucto/engine';
import {
  ButtonDirective,
  IconComponent,
  type IconName,
  KeycapComponent,
  SegmentedComponent,
  SliderComponent,
} from '@naucto/ui';

import { GamepadArtComponent } from './gamepad-art.component';

/** Face of a standard-mapping button, so a captured binding reads as the pad's own label. */
const PAD_BUTTON: Record<number, string> = {
  0: 'A',
  1: 'B',
  2: 'X',
  3: 'Y',
  4: 'L1',
  5: 'R1',
  6: 'L2',
  7: 'R2',
  8: 'SELECT',
  9: 'START',
  10: 'L3',
  11: 'R3',
  12: 'D-PAD',
  13: 'D-PAD',
  14: 'D-PAD',
  15: 'D-PAD',
};

/**
 * The direction a pad binding points, as a glyph rather than an arrow character.
 *
 * For the same reason the keyboard arrows above are spelled out: the face this table is set in has
 * no arrows, so `←→↑↓` fall back to whatever else the system can find and print smooth in the
 * middle of a pixel table. The icon set draws them on the same grid as everything around them.
 */
/**
 * The other name of a face button, as the shape a controller prints on it.
 *
 * For the reason the arrows below are drawn rather than typed: the face this table is set in has
 * no cross, circle, square or triangle, so the characters fell back to a smooth glyph in the
 * middle of a pixel table. These are the shapes, not the meanings — a set has one cross and one
 * circle, and what they are called elsewhere does not change what they draw.
 */
const PAD_FACE: Record<number, IconName> = {
  0: 'close',
  1: 'circle',
  2: 'square',
  3: 'triangle',
};

const PAD_ARROW: Record<number, IconName> = {
  12: 'arrow-up',
  13: 'arrow-down',
  14: 'arrow-left',
  15: 'arrow-right',
};

const AXIS_ARROW = (a: GamepadButtonRef): IconName =>
  a.axis === 0
    ? a.direction === -1
      ? 'arrow-left'
      : 'arrow-right'
    : a.direction === -1
      ? 'arrow-up'
      : 'arrow-down';

const KEY_LABEL: Record<string, string> = {
  // Words, not ←→↑↓: HD44780 has no arrows, so those four fell back to a smooth face in the
  // middle of a table set in the pixel one. The rest of this map already spells things out.
  ArrowLeft: 'LEFT',
  ArrowRight: 'RIGHT',
  ArrowUp: 'UP',
  ArrowDown: 'DOWN',
  ' ': 'SPACE',
  Escape: 'ESC',
  Enter: 'ENTER',
  Shift: 'SHIFT',
  Tab: 'TAB',
  Backspace: 'BKSP',
};

interface Row {
  action: Action;
  /** What the game calls this action, when it declared one. */
  label: string;
  keys: string[];
  pad: GamepadButtonRef[];
}

/** What is being captured: a keyboard key or a gamepad button, for one action. */
interface Capture {
  action: Action;
  device: 'keyboard' | 'gamepad';
  /** The key being replaced, when rebinding an existing one rather than adding. */
  replacing?: string;
}

/** CONTROLS tab: the action map per player slot, plus the connected gamepad. */
@Component({
  selector: 'nc-controls-settings',
  imports: [
    TranslocoDirective,
    ButtonDirective,
    GamepadArtComponent,
    IconComponent,
    KeycapComponent,
    SegmentedComponent,
    SliderComponent,
  ],
  template: `
    <div *transloco="let t" class="grid gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div>
        <p class="mb-2 max-w-[640px] text-body text-ink-2">
          {{ t('settings.controlsIntroBefore') }}
          <code class="font-mono text-meta text-sky-ink">btn("left")</code>
          {{ t('settings.controlsIntroAfter') }}
        </p>
        <div class="mb-1 flex flex-wrap items-center gap-1">
          @if (gameName()) {
            <span class="label">{{ gameName() }} ·</span>
          }
          <nc-segmented
            variant="chips"
            [options]="players"
            [value]="String(player())"
            (valueChange)="setPlayer($event)"
          />
        </div>

        <!-- The sheet captions the table from outside its border, on the page's own ground and
             with no band of its own. Drawn here rather than in the head row, which stays for the
             sake of the column association a screen reader needs and is taken out of the picture. -->
        <div aria-hidden="true" class="label mx-[1px] grid grid-cols-[24%_40%_36%] text-ink-3">
          <span class="px-1.75 pb-1.5">{{ t('settings.action') }}</span>
          <span class="px-1.75 pb-1.5">{{ t('settings.keyboard') }}</span>
          <span class="px-1.75 pb-1.5">{{ t('settings.gamepad') }}</span>
        </div>
        <!-- The design cards the table rather than letting it run edge to edge. -->
        <div class="overflow-hidden rounded-[6px] border border-line bg-sunken">
          <!-- The action names lead, so the eye follows what is being bound down the table; but
               they are one word each, and a share taken from a sheet 580 wide turns into half a
               table on a screen twice that, with the key caps wrapping beside all that empty. The
               two columns carrying the matter get the room instead. -->
          <table class="w-full table-fixed border-collapse text-body">
            <colgroup>
              <col class="w-[24%]" />
              <col class="w-[40%]" />
              <col class="w-[36%]" />
            </colgroup>
            <thead>
              <tr>
                <th scope="col" class="sr-only">{{ t('settings.action') }}</th>
                <th scope="col" class="sr-only">{{ t('settings.keyboard') }}</th>
                <th scope="col" class="sr-only">{{ t('settings.gamepad') }}</th>
              </tr>
            </thead>
            <tbody>
              @for (r of rows(); track r.action) {
                <tr
                  class="border-b border-line-soft last:border-b-0"
                  [class.bg-raised]="capturing()?.action === r.action"
                >
                  <td class="px-1.75 py-1.5">
                    <div class="font-mono text-meta text-ink">{{ r.action }}</div>
                    @if (r.label) {
                      <div class="label">{{ r.label }}</div>
                    }
                  </td>
                  <td class="px-1.75 py-1.5">
                    <div class="flex flex-wrap items-center gap-0.5">
                      @for (k of r.keys; track k) {
                        <button
                          type="button"
                          class="group inline-flex items-center"
                          [attr.aria-label]="t('settings.rebindKey', { key: label(k) })"
                          (click)="capture(r.action, 'keyboard', k)"
                        >
                          <nc-keycap>{{ label(k) }}</nc-keycap>
                          <nc-icon
                            name="close"
                            [size]="12"
                            class="ml-0.5 hidden text-ink-4 group-hover:inline"
                            (click)="removeKey($event, r.action, k)"
                          />
                        </button>
                      }
                      @if (isCapturing(r.action, 'keyboard')) {
                        <span
                          class="label rounded-xs border border-gold bg-gold-wash px-1 py-0.5 text-gold-ink"
                        >
                          {{ t('settings.pressKey') }}
                        </span>
                      } @else {
                        <button
                          ncButton
                          variant="ghost"
                          size="sm"
                          iconOnly
                          [attr.aria-label]="t('settings.addKey')"
                          (click)="capture(r.action, 'keyboard')"
                        >
                          <nc-icon name="plus" [size]="12" />
                        </button>
                      }
                    </div>
                  </td>
                  <td class="px-1.75 py-1.5">
                    <div class="flex flex-wrap items-center gap-0.5">
                      @if (isCapturing(r.action, 'gamepad')) {
                        <span
                          class="label rounded-xs border border-gold bg-gold-wash px-1 py-0.5 text-gold-ink"
                        >
                          {{ t('settings.pressButton') }}
                        </span>
                      } @else {
                        <button
                          type="button"
                          [attr.aria-label]="t('settings.rebindPad')"
                          (click)="capture(r.action, 'gamepad')"
                        >
                          @let pad = padLabel(r.pad);
                          <nc-keycap>
                            {{ pad.text }}
                            @if (pad.icon; as arrow) {
                              <nc-icon [name]="arrow" [size]="12" />
                            }
                          </nc-keycap>
                        </button>
                      }
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <div class="mt-1.5 flex items-center gap-1">
          <button
            ncButton
            variant="secondary"
            size="sm"
            (click)="bindings.reset()"
            [disabled]="bindings.isDefault()"
          >
            {{ t('settings.resetDefaults') }}
          </button>
          @if (capturing()) {
            <span class="label">{{ t('settings.escapeCancels') }}</span>
          }
        </div>
      </div>

      <div class="grid content-start gap-2">
        <div class="rounded-sm border border-line bg-panel p-1.5">
          <div class="flex items-center justify-between">
            <span
              class="label flex items-center gap-0.5"
              [class]="pad() ? 'text-jade-ink' : 'text-ink-4'"
            >
              <span
                class="inline-block h-1 w-1 rounded-xs"
                [class]="pad() ? 'bg-jade' : 'bg-ink-4'"
              ></span>
              {{ pad() ? t('settings.connected') : t('settings.noPad') }}
            </span>
            <span class="label">{{ t('settings.slot', { n: 1 }) }}</span>
          </div>
          <div class="my-2 flex justify-center">
            <nc-gamepad-art />
          </div>
          <div class="text-center text-body text-ink">{{ pad()?.id ?? '—' }}</div>
          <div class="label text-center">{{ t('settings.pressAny') }}</div>
        </div>

        <!-- The on-screen pad, for the device that has no keyboard and no gamepad. The preview is
           live: both sliders drive the same store the pad itself reads.

           TODO(NCTO-mobile): nothing reads these yet. A phone cannot open the editor and does not
           get the pad on a game page either, so the two sliders below set a size and an opacity for
           a control nobody is shown. They stay because the store and the pad are built and this is
           where they will be tuned; until a phone can play, they tune nothing. -->
        <div class="rounded-sm border border-line bg-panel p-1.5">
          <!-- Icon-only reset: spelled out, it did not fit beside the label in a 236px column, and
               the label wrapped to two lines and fell out of line with it. The artboard draws this
               header as the label alone. -->
          <div class="mb-1 flex items-center justify-between gap-1">
            <span class="label whitespace-nowrap">{{ t('settings.padLayout') }}</span>
            <button
              ncButton
              variant="ghost"
              size="sm"
              iconOnly
              [attr.aria-label]="t('settings.resetDefaults')"
              (click)="padSettings.reset()"
              [disabled]="padSettings.isDefault()"
            >
              <nc-icon name="undo" [size]="12" />
            </button>
          </div>
          <div
            class="relative flex h-[84px] items-center justify-between rounded-sm border border-line bg-inset px-1.5"
            [style.opacity]="padSettings.opacity() / 100"
            aria-hidden="true"
          >
            <span
              class="grid grid-cols-3 grid-rows-3 gap-px"
              [style.--nc-preview]="padSettings.scale()"
            >
              <span></span>
              <span
                class="h-[calc(12px*var(--nc-preview,1))] w-[calc(12px*var(--nc-preview,1))] rounded-t-xs bg-ink-4"
              ></span>
              <span></span>
              <span
                class="h-[calc(12px*var(--nc-preview,1))] w-[calc(12px*var(--nc-preview,1))] rounded-l-xs bg-ink-4"
              ></span>
              <span
                class="h-[calc(12px*var(--nc-preview,1))] w-[calc(12px*var(--nc-preview,1))] bg-ink-3"
              ></span>
              <span
                class="h-[calc(12px*var(--nc-preview,1))] w-[calc(12px*var(--nc-preview,1))] rounded-r-xs bg-ink-4"
              ></span>
              <span></span>
              <span
                class="h-[calc(12px*var(--nc-preview,1))] w-[calc(12px*var(--nc-preview,1))] rounded-b-xs bg-ink-4"
              ></span>
              <span></span>
            </span>
            <span class="flex items-center gap-1" [style.--nc-preview]="padSettings.scale()">
              <span
                class="h-[calc(22px*var(--nc-preview,1))] w-[calc(22px*var(--nc-preview,1))] rounded-full bg-sky/45"
              ></span>
              <span
                class="h-[calc(24px*var(--nc-preview,1))] w-[calc(24px*var(--nc-preview,1))] rounded-full bg-hot/50"
              ></span>
            </span>
          </div>
          <div class="mt-1.5 grid gap-1">
            <nc-slider
              [label]="t('settings.padSize')"
              [min]="60"
              [max]="140"
              [value]="padSettings.size()"
              [readout]="padSettings.size() + '%'"
              (valueChange)="padSettings.setSize($event)"
            />
            <nc-slider
              [label]="t('settings.padOpacity')"
              [min]="30"
              [max]="100"
              [value]="padSettings.opacity()"
              [readout]="padSettings.opacity() + '%'"
              (valueChange)="padSettings.setOpacity($event)"
            />
          </div>
          <p class="mt-1 text-meta leading-[1.6] text-ink-3">{{ t('settings.padHint') }}</p>
        </div>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ControlsSettingsComponent {
  /**
   * Names the running game gave its actions with `input.declare{}`. The settings page has no game
   * and shows the bare action names; the game page passes what the release declared.
   */
  readonly declared = input<readonly DeclaredAction[]>([]);
  readonly gameName = input('');

  protected readonly bindings = inject(InputBindingsStore);
  protected readonly padSettings = inject(PadSettingsStore);
  protected readonly String = String;
  protected readonly player = signal(0);
  protected readonly capturing = signal<Capture | null>(null);
  protected readonly pad = signal<{ id: string } | null>(null);
  protected readonly players = [
    { value: '0', label: 'Player 1' },
    { value: '1', label: 'Player 2' },
  ];

  protected readonly rows = computed<Row[]>(() => {
    const labels = new Map(this.declared().map((d) => [d.action, d.label]));
    const b = this.bindings.bindings();
    return ACTIONS.map((action) => ({
      action,
      label: labels.get(action) ?? '',
      keys: [...new Set((b.keyboard[this.player()]?.[action] ?? []).map((k) => this.canonical(k)))],
      pad: b.gamepad[action] ?? [],
    }));
  });

  constructor() {
    const onKey = (e: KeyboardEvent): void => {
      const c = this.capturing();
      if (c?.device !== 'keyboard') return;
      e.preventDefault();
      e.stopPropagation();
      this.capturing.set(null);
      // Escape is how you back out of a capture, so it can never be what a capture binds.
      if (e.key === 'Escape') return;
      const variants = e.key.length === 1 ? [e.key.toLowerCase(), e.key.toUpperCase()] : [e.key];
      const current = this.bindings.bindings().keyboard[this.player()]?.[c.action] ?? [];
      const kept = c.replacing ? current.filter((k) => this.canonical(k) !== c.replacing) : current;
      this.bindings.setKeys(this.player(), c.action, [...new Set([...kept, ...variants])]);
    };
    window.addEventListener('keydown', onKey, true);

    const poll = setInterval(() => {
      const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
      const first = pads.find((p) => p !== null) ?? null;
      this.pad.set(first ? { id: first.id } : null);
      const c = this.capturing();
      if (!first || c?.device !== 'gamepad') return;
      const pressed = first.buttons.findIndex((b) => b.pressed);
      if (pressed >= 0) {
        this.capturing.set(null);
        this.bindings.setGamepad(c.action, [{ button: pressed }]);
        return;
      }
      const axis = first.axes.findIndex((v) => Math.abs(v) > 0.6);
      if (axis >= 0) {
        this.capturing.set(null);
        this.bindings.setGamepad(c.action, [
          { axis, direction: (first.axes[axis] ?? 0) < 0 ? -1 : 1 },
        ]);
      }
    }, 120);

    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('keydown', onKey, true);
      clearInterval(poll);
    });
  }

  protected setPlayer(v: string | undefined): void {
    this.player.set(v === '1' ? 1 : 0);
    this.capturing.set(null);
  }

  protected isCapturing(action: Action, device: Capture['device']): boolean {
    const c = this.capturing();
    return c?.action === action && c.device === device;
  }

  protected capture(action: Action, device: Capture['device'], replacing?: string): void {
    this.capturing.set({ action, device, replacing });
  }

  protected removeKey(event: Event, action: Action, key: string): void {
    // The keycap itself rebinds; the × removes. Both live in one button, so stop the outer handler.
    event.stopPropagation();
    const current = this.bindings.bindings().keyboard[this.player()]?.[action] ?? [];
    this.bindings.setKeys(
      this.player(),
      action,
      current.filter((k) => this.canonical(k) !== key),
    );
  }

  protected label(key: string): string {
    return KEY_LABEL[key] ?? key.toUpperCase();
  }

  protected padLabel(refs: readonly GamepadButtonRef[]): { text: string; icon?: IconName } {
    const first = refs[0];
    if (!first) return { text: '—' };
    if (first.button !== undefined) {
      return {
        text: PAD_BUTTON[first.button] ?? `B${String(first.button)}`,
        icon: PAD_ARROW[first.button] ?? PAD_FACE[first.button],
      };
    }
    return { text: `AXIS ${String(first.axis ?? 0)}`, icon: AXIS_ARROW(first) };
  }

  /** `a` and `A` are one binding; the map stores both so a shifted key still matches. */
  private canonical(key: string): string {
    return key.length === 1 ? key.toLowerCase() : key;
  }
}
