import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import type { ActionInput } from '@naucto/engine';
import { IconComponent } from '@naucto/ui';

import { InputCapComponent } from './input-cap.component';

/**
 * What presses one action, a line per device: the first player's keys, the second player's, a
 * gamepad. The inputs of a line are alternatives, and are written as such.
 */
@Component({
  selector: 'nc-action-inputs',
  imports: [TranslocoDirective, IconComponent, InputCapComponent],
  templateUrl: './action-inputs.component.html',
  host: { class: 'grid gap-y-0.5' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActionInputsComponent {
  readonly inputs = input.required<readonly ActionInput[]>();
  /**
   * Says whose the first player's keys are. Left off for a game played on one keyboard layout,
   * which has no first player to tell from a second.
   */
  readonly twoKeyboards = input(false, { transform: booleanAttribute });

  protected readonly devices = computed(() =>
    [
      {
        kind: 'p1' as const,
        inputs: this.inputs().filter((plugged) => plugged.kind === 'key' && plugged.player === 0),
      },
      {
        kind: 'p2' as const,
        inputs: this.inputs().filter((plugged) => plugged.kind === 'key' && plugged.player === 1),
      },
      { kind: 'pad' as const, inputs: this.inputs().filter((plugged) => plugged.kind === 'pad') },
    ].filter((device) => device.inputs.length > 0),
  );
}

/** Whether any action of a game has a key for the second player. */
export const usesTwoKeyboards = (actions: readonly { inputs: readonly ActionInput[] }[]): boolean =>
  actions.some((action) =>
    action.inputs.some((plugged) => plugged.kind === 'key' && plugged.player === 1),
  );
