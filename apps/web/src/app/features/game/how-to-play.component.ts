import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import type { GameAction } from '@naucto/engine';
import { LabelComponent } from '@naucto/ui';

import {
  ActionInputsComponent,
  usesTwoKeyboards,
} from '../../shared/input/action-inputs.component';

/**
 * How to play, read from the game's own actions: what each is called, what it does, and what
 * presses it on the first player's keys, the second player's and a gamepad.
 */
@Component({
  selector: 'nc-how-to-play',
  imports: [TranslocoDirective, ActionInputsComponent, LabelComponent],
  templateUrl: './how-to-play.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HowToPlayComponent {
  readonly actions = input.required<readonly GameAction[]>();
  protected readonly twoKeyboards = computed(() => usesTwoKeyboards(this.actions()));
}
