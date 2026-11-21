import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { ButtonDirective, IconComponent, SliderComponent } from '@naucto/ui';

import { PadSettingsStore } from '../../shared/game-screen/pad-settings.store';
import { GamepadArtComponent } from './gamepad-art.component';

/** How often the gamepad is looked for: the Gamepad API has no event for a pad waking up. */
const POLL_MS = 250;

/**
 * CONTROLS tab: what belongs to this device rather than to a game — the gamepad plugged into it
 * and the on-screen pad's size and opacity. What a key or a control does is each game's to say.
 */
@Component({
  selector: 'nc-controls-settings',
  imports: [
    TranslocoDirective,
    ButtonDirective,
    GamepadArtComponent,
    IconComponent,
    SliderComponent,
  ],
  templateUrl: './controls-settings.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ControlsSettingsComponent {
  protected readonly padSettings = inject(PadSettingsStore);
  /** The first connected gamepad, if any. */
  protected readonly pad = signal<{ id: string } | null>(null, {
    equal: (a, b) => a?.id === b?.id,
  });

  constructor() {
    const poll = setInterval(() => {
      const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
      const first = pads.find((gamepad) => gamepad !== null);
      this.pad.set(first ? { id: first.id } : null);
    }, POLL_MS);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(poll);
    });
  }
}
