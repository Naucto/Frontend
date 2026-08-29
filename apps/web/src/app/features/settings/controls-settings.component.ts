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
import { TranslocoDirective } from '@jsverse/transloco';
import { type Action, ACTIONS, type DeclaredAction, type GamepadButtonRef } from '@naucto/engine';
import { ButtonDirective, IconComponent, KeycapComponent, SegmentedComponent } from '@naucto/ui';

/** Face of a standard-mapping button, so a captured binding reads as the pad's own label. */
const PAD_BUTTON: Record<number, string> = {
  0: 'A / ✕',
  1: 'B / ○',
  2: 'X / □',
  3: 'Y / △',
  4: 'L1',
  5: 'R1',
  6: 'L2',
  7: 'R2',
  8: 'SELECT',
  9: 'START',
  10: 'L3',
  11: 'R3',
  12: 'D-PAD ↑',
  13: 'D-PAD ↓',
  14: 'D-PAD ←',
  15: 'D-PAD →',
};

const AXIS_LABEL = (a: GamepadButtonRef): string => {
  const arrow = a.axis === 0 ? (a.direction === -1 ? '←' : '→') : a.direction === -1 ? '↑' : '↓';
  return `AXIS ${String(a.axis ?? 0)} ${arrow}`;
};

const KEY_LABEL: Record<string, string> = {
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
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
    IconComponent,
    KeycapComponent,
    SegmentedComponent,
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

        <!-- The design cards the table rather than letting it run edge to edge. -->
        <div class="overflow-hidden rounded-[6px] border border-line bg-sunken">
          <table class="w-full border-collapse text-body">
            <thead>
              <tr class="label bg-inset">
                <th class="border-b border-line px-1.75 py-1.5 text-left font-normal">
                  {{ t('settings.action') }}
                </th>
                <th class="border-b border-line px-1.75 py-1.5 text-left font-normal">
                  {{ t('settings.keyboard') }}
                </th>
                <th class="border-b border-line px-1.75 py-1.5 text-left font-normal">
                  {{ t('settings.gamepad') }}
                </th>
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
                          <nc-keycap>{{ padLabel(r.pad) }}</nc-keycap>
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

      <div class="rounded-sm border border-line bg-panel p-2">
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
        <div class="my-2 flex justify-center text-ink-3">
          <nc-icon name="gamepad" [size]="48" />
        </div>
        <div class="text-center text-body text-ink">{{ pad()?.id ?? '—' }}</div>
        <div class="label text-center">{{ t('settings.pressAny') }}</div>
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

  protected padLabel(refs: readonly GamepadButtonRef[]): string {
    const first = refs[0];
    if (!first) return '—';
    return first.button !== undefined
      ? (PAD_BUTTON[first.button] ?? `B${String(first.button)}`)
      : AXIS_LABEL(first);
  }

  /** `a` and `A` are one binding; the map stores both so a shifted key still matches. */
  private canonical(key: string): string {
    return key.length === 1 ? key.toLowerCase() : key;
  }
}
