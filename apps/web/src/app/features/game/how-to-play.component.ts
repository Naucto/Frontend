import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { type Action, type DeclaredAction, DEFAULT_BINDINGS } from '@naucto/engine';
import { KeycapComponent, LabelComponent } from '@naucto/ui';

const KEY_LABELS: Record<string, string> = {
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ' ': 'Space',
  Escape: 'Esc',
  Enter: 'Enter',
  Shift: 'Shift',
};

/** What each action means when the game has not named it itself. */
const FALLBACK_LABELS: Record<Action, string> = {
  left: 'move',
  right: 'move',
  up: 'move',
  down: 'move',
  a: 'jump / confirm',
  b: 'action',
  x: 'action',
  y: 'action',
  pause: 'pause',
};

const DIRECTIONS: Action[] = ['left', 'right', 'up', 'down'];

interface Row {
  action: Action | 'arrows';
  keys: string[];
  label: string;
}

/**
 * How to play, read from the game's own action map: the four directions collapse into one ARROWS
 * chip, and each row is named the way the game's GAME tab named it.
 */
@Component({
  selector: 'nc-how-to-play',
  imports: [TranslocoDirective, KeycapComponent, LabelComponent],
  templateUrl: './how-to-play.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HowToPlayComponent {
  /** What the game's document names; empty falls back to the engine's own action names. */
  readonly declared = input<readonly DeclaredAction[]>([]);

  protected readonly rows = computed<Row[]>(() => {
    const declared = this.declared();
    const actions: Action[] = declared.length
      ? declared.map((d) => d.action)
      : (['left', 'right', 'up', 'down', 'a', 'b', 'pause'] as Action[]);
    const labelOf = (a: Action): string =>
      declared.find((d) => d.action === a)?.label ?? FALLBACK_LABELS[a];

    const rows: Row[] = [];
    const [firstDirection] = actions.filter((a) => DIRECTIONS.includes(a));
    if (firstDirection) {
      // One chip for the whole d-pad, as the design draws it.
      rows.push({ action: 'arrows', keys: ['Arrows'], label: labelOf(firstDirection) });
    }
    for (const action of actions.filter((a) => !DIRECTIONS.includes(a))) {
      rows.push({ action, keys: keysFor(action), label: labelOf(action) });
    }
    return rows;
  });
}

function keysFor(action: Action): string[] {
  return (DEFAULT_BINDINGS.keyboard[0]?.[action] ?? [])
    .filter((k) => k.length > 1 || k === k.toLowerCase())
    .slice(0, 2)
    .map((k) => KEY_LABELS[k] ?? k.toUpperCase());
}
