import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { type ActionInput, type GameAction, touchControlsOf } from '@naucto/engine';
import { ChipComponent, DisclosureComponent, TableDirective } from '@naucto/ui';

import { readJson, STORAGE_KEYS, writeJson } from '../../core/storage/local-storage';
import { coarsePointer } from '../../shared/input/coarse-pointer';
import { InputCapComponent } from '../../shared/input/input-cap.component';
import { PLAYER_TONES } from '../../shared/input/player-tone';

/** Past this many actions the list is cut in two, set side by side where there is room. */
const ONE_TABLE = 4;

/** A column of what presses an action, headed by a word or by the keyboard player it is for. */
interface Column {
  head: string;
  player?: number;
  /**
   * How its alternatives are laid: keys, which a game may give many of, fold onto more lines
   * before anything else gives way; the controls of a pad stay on one while the table has the
   * width of a page.
   */
  layout: string;
  inputsOf: (action: GameAction) => ActionInput[];
}

const FOLDS = 'flex-wrap';
const HOLDS = 'flex-wrap @[480px]:flex-nowrap';

const keysOf =
  (player: number) =>
  (action: GameAction): ActionInput[] =>
    action.inputs.filter((plugged) => plugged.kind === 'key' && plugged.player === player);

const PAD: Column = {
  head: 'game.howTo.pad',
  layout: HOLDS,
  inputsOf: (action) => action.inputs.filter((plugged) => plugged.kind === 'pad'),
};
const TOUCH: Column = {
  head: 'game.howTo.touch',
  layout: HOLDS,
  inputsOf: (action) => touchControlsOf([action]).map((control) => ({ kind: 'pad', control })),
};
const ONE_KEYBOARD: Column[] = [
  { head: 'game.howTo.keys', layout: FOLDS, inputsOf: keysOf(0) },
  PAD,
];
const TWO_KEYBOARDS: Column[] = [
  { head: 'game.howTo.keys', player: 0, layout: FOLDS, inputsOf: keysOf(0) },
  { head: 'game.howTo.keys', player: 1, layout: FOLDS, inputsOf: keysOf(1) },
  PAD,
];

/**
 * How to play, read from the game's own actions: a row per action, named as the game names it,
 * then what presses it. A device with keys gets the keys, a column per keyboard player when the
 * game has two, and the gamepad; a touch device gets the control of the on-screen pad and nothing
 * else. Folds away, and stays as it was left on this device.
 */
@Component({
  selector: 'nc-how-to-play',
  imports: [
    TranslocoDirective,
    ChipComponent,
    DisclosureComponent,
    InputCapComponent,
    TableDirective,
  ],
  templateUrl: './how-to-play.component.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HowToPlayComponent {
  readonly actions = input.required<readonly GameAction[]>();
  protected readonly open = signal(readJson(STORAGE_KEYS.howToPlayOpen, true));
  protected readonly touch = coarsePointer();
  protected readonly tones = PLAYER_TONES;
  protected readonly columns = computed(() => {
    if (this.touch) {
      return [TOUCH];
    }
    const second = keysOf(1);
    return this.actions().some((action) => second(action).length) ? TWO_KEYBOARDS : ONE_KEYBOARD;
  });
  protected readonly tables = computed(() => {
    const actions = this.actions();
    const cut = actions.length > ONE_TABLE ? Math.ceil(actions.length / 2) : actions.length;
    return [actions.slice(0, cut), actions.slice(cut)]
      .filter((half) => half.length > 0)
      .map((half) =>
        half.map((action) => ({
          action,
          cells: this.columns().map(({ layout, inputsOf }) => ({
            layout,
            inputs: inputsOf(action),
          })),
        })),
      );
  });

  protected toggle(): void {
    this.open.update((open) => !open);
    writeJson(STORAGE_KEYS.howToPlayOpen, this.open());
  }
}
