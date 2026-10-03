import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { InputBindingsStore } from '@app/core/input/input-bindings.store';
import { PadSettingsStore } from '@app/shared/game-screen/pad-settings.store';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { type Action, ACTIONS, type GamepadButtonRef } from '@naucto/engine';
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
 * The shape a controller prints on a face button, as an icon: the HD44780 face has no cross,
 * circle, square or triangle.
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
  // Words, not ←→↑↓: the HD44780 face has no arrow glyphs.
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
  templateUrl: './controls-settings.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ControlsSettingsComponent {
  private readonly transloco = inject(TranslocoService);
  protected readonly bindings = inject(InputBindingsStore);
  protected readonly padSettings = inject(PadSettingsStore);
  protected readonly String = String;
  protected readonly player = signal(0);
  protected readonly capturing = signal<Capture | null>(null);
  protected readonly pad = signal<{ id: string } | null>(null);
  protected readonly players = computed(() => [
    { value: '0', label: this.transloco.translate('settings.player', { n: 1 }) },
    { value: '1', label: this.transloco.translate('settings.player', { n: 2 }) },
  ]);

  protected readonly rows = computed<Row[]>(() => {
    const b = this.bindings.bindings();
    return ACTIONS.map((action) => ({
      action,
      keys: [...new Set((b.keyboard[this.player()]?.[action] ?? []).map((k) => this.canonical(k)))],
      pad: b.gamepad[action] ?? [],
    }));
  });

  constructor() {
    const onKey = (e: KeyboardEvent): void => {
      const c = this.capturing();
      if (!c) return;
      // Escape is how you back out of a capture, so it can never be what a capture binds.
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.capturing.set(null);
        return;
      }
      if (c.device !== 'keyboard') return;
      e.preventDefault();
      e.stopPropagation();
      this.capturing.set(null);
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
