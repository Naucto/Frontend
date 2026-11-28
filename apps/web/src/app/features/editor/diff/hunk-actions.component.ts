import { booleanAttribute, ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import type { Decision } from '@naucto/engine';
import { ButtonDirective, JoinedDirective, LooksOnlyDirective, MarkComponent } from '@naucto/ui';

/**
 * Accept and reject one change, or a group of them, as one joined pair: accept in jade, reject
 * raised. Once decided, the pair gives way to what was decided and an undo.
 *
 * It decides and writes nothing itself: diff mode closes every control that writes, so the pair is
 * let through as one that only looks, and the store applies what was kept later, in one step.
 */
@Component({
  selector: 'nc-hunk-actions',
  imports: [
    TranslocoDirective,
    ButtonDirective,
    JoinedDirective,
    LooksOnlyDirective,
    MarkComponent,
  ],
  templateUrl: './hunk-actions.component.html',
  host: { class: 'inline-flex shrink-0 items-center gap-1' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HunkActionsComponent {
  readonly decision = input<Decision>('pending');
  /** Marks alone, for a row with no room for words. */
  readonly iconOnly = input(false, { transform: booleanAttribute });
  /** The catalogue keys of the two words, for a change that reads better as "Create file". */
  readonly acceptKey = input('editor.diff.accept');
  readonly rejectKey = input('editor.diff.reject');
  readonly decided = output<Decision>();
}
