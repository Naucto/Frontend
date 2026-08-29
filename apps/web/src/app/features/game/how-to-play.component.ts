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
  keys: string[];
  label: string;
}

/**
 * How to play, read from the game's own action map: the four directions collapse into one ARROWS
 * chip, and each row is named the way the game named it with `input.declare`.
 */
@Component({
  selector: 'nc-how-to-play',
  imports: [TranslocoDirective, KeycapComponent, LabelComponent],
  template: `
    <div *transloco="let t">
      <nc-label class="mb-1">{{ t('game.howToPlay') }}</nc-label>
      <dl class="grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-1">
        @for (row of rows(); track row.label) {
          <dt class="flex gap-0.5">
            @for (k of row.keys; track k) {
              <nc-keycap>{{ k }}</nc-keycap>
            }
          </dt>
          <dd class="text-meta text-ink-2">{{ row.label }}</dd>
        }
        <dt><nc-keycap>Gamepad</nc-keycap></dt>
        <dd class="text-meta text-ink-2">{{ t('game.gamepad') }}</dd>
      </dl>
      <p class="mt-1 text-label text-ink-4">{{ t('game.readFromMap') }}</p>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HowToPlayComponent {
  /** What the running game declared; empty falls back to the engine's own action names. */
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
      rows.push({ keys: ['Arrows'], label: labelOf(firstDirection) });
    }
    for (const action of actions.filter((a) => !DIRECTIONS.includes(a))) {
      rows.push({ keys: keysFor(action), label: labelOf(action) });
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
