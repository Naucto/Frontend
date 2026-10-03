import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
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

import { InputBindingsStore } from '../../core/input/input-bindings.store';
import { PadSettingsStore } from '../../shared/game-screen/pad-settings.store';
import { BindingCaptureService, canonicalKey, type Capture } from './binding-capture.service';
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

const AXIS_ARROW = (ref: GamepadButtonRef): IconName =>
  ref.axis === 0
    ? ref.direction === -1
      ? 'arrow-left'
      : 'arrow-right'
    : ref.direction === -1
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
  providers: [BindingCaptureService],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ControlsSettingsComponent {
  private readonly transloco = inject(TranslocoService);
  protected readonly bindings = inject(InputBindingsStore);
  protected readonly padSettings = inject(PadSettingsStore);
  protected readonly String = String;
  private readonly captures = inject(BindingCaptureService);
  protected readonly player = this.captures.player;
  protected readonly capturing = this.captures.capturing;
  protected readonly pad = this.captures.pad;
  protected readonly players = computed(() => [
    { value: '0', label: this.transloco.translate('settings.player', { n: 1 }) },
    { value: '1', label: this.transloco.translate('settings.player', { n: 2 }) },
  ]);

  protected readonly rows = computed<Row[]>(() => {
    const allBindings = this.bindings.bindings();
    return ACTIONS.map((action) => ({
      action,
      keys: [
        ...new Set(
          (allBindings.keyboard[this.player()]?.[action] ?? []).map((key) => canonicalKey(key)),
        ),
      ],
      pad: allBindings.gamepad[action] ?? [],
    }));
  });

  protected setPlayer(value: string | undefined): void {
    this.player.set(value === '1' ? 1 : 0);
    this.capturing.set(null);
  }

  protected isCapturing(action: Action, device: Capture['device']): boolean {
    const active = this.capturing();
    return active?.action === action && active.device === device;
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
      current.filter((candidate) => canonicalKey(candidate) !== key),
    );
  }

  protected label(key: string): string {
    return KEY_LABEL[key] ?? key.toUpperCase();
  }

  protected padLabel(refs: readonly GamepadButtonRef[]): { text: string; icon?: IconName } {
    const first = refs[0];
    if (!first) {
      return { text: '—' };
    }
    if (first.button !== undefined) {
      return {
        text: PAD_BUTTON[first.button] ?? `B${String(first.button)}`,
        icon: PAD_ARROW[first.button] ?? PAD_FACE[first.button],
      };
    }
    return { text: `AXIS ${String(first.axis ?? 0)}`, icon: AXIS_ARROW(first) };
  }
}
