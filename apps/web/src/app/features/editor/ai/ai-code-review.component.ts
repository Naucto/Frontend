import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { type DiffRow, lineDiff } from '@naucto/engine';
import { ButtonDirective } from '@naucto/ui';

/** A run of new-file lines a person has chosen, 1-based and inclusive, as the API takes it. */
export interface LineChoice {
  from: number;
  to: number;
}

/**
 * Which rows are being offered, and which of them have been taken.
 *
 * A row is a unit of review because it is the smallest thing the diff can honestly describe: a line
 * that became a different line, a line that is new, a line that is gone. "Same" rows are not
 * offered, because there is nothing to accept about a line that did not change.
 *
 * Kept out of the component so it can be tested, and so the component is only drawing.
 */
export function reviewableRows(rows: readonly DiffRow[]): { row: DiffRow; index: number }[] {
  const out: { row: DiffRow; index: number }[] = [];
  rows.forEach((row, index) => {
    if (row.kind === 'same') return;
    out.push({ row, index });
  });
  return out;
}

/** The chosen rows as ranges, merged where they sit next to each other. */
export function chosenRanges(chosen: ReadonlySet<number>, rows: readonly DiffRow[]): LineChoice[] {
  const ranges: LineChoice[] = [];
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row?.right || row.kind === 'removed' || !chosen.has(i)) continue;
    const from = row.right.number;
    let to = from;
    while (i + 1 < rows.length) {
      const next = rows[i + 1];
      if (
        !next?.right ||
        next.kind === 'removed' ||
        !chosen.has(i + 1) ||
        next.right.number !== to + 1
      )
        break;
      to = next.right.number;
      i += 1;
    }
    ranges.push({ from, to });
  }
  return ranges;
}

/**
 * A change, shown the way you read code: the file as it is on one side, the file as the assistant
 * proposes it on the other, lined up.
 *
 * Each changed line is offered on its own, because a change that is three edits you want and one
 * you do not is the normal case, and taking all or nothing is not a decision anybody can make
 * without understanding the whole file first. Accept all is there for when they do want all of it,
 * and closing returns to editing.
 */
@Component({
  selector: 'nc-ai-code-review',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoDirective, ButtonDirective],
  host: { class: 'block h-full min-h-0' },
  template: `
    <div *transloco="let t" class="flex h-full flex-col">
      <div class="flex items-center gap-1.5 border-b border-line px-1.5 py-1">
        <p class="text-ui text-ink grow truncate">{{ title() }}</p>
        <p class="label">{{ t('ai.review.chosen', { count: chosen().size }) }}</p>
        <button
          ncButton
          variant="secondary"
          size="sm"
          [disabled]="!rows().length"
          (click)="takeAll()"
        >
          {{ t('ai.review.acceptAll') }}
        </button>
        <button
          ncButton
          variant="secondary"
          size="sm"
          [disabled]="!chosen().size"
          (click)="takeChosen()"
        >
          {{ t('ai.review.acceptChosen', { count: chosen().size }) }}
        </button>
        <button ncButton variant="ghost" size="sm" (click)="close()">
          {{ t('ai.review.close') }}
        </button>
      </div>
      <div class="min-h-0 grow overflow-auto font-mono text-meta">
        @for (entry of rows(); track entry.index) {
          <div class="grid grid-cols-2 border-b border-line/40">
            <div class="flex gap-1 px-1" [class.bg-line-40]="entry.row.kind !== 'same'">
              <span class="w-8 shrink-0 text-right text-ink-3">
                {{ entry.row.left?.number ?? '' }}
              </span>
              <span
                class="grow whitespace-pre-wrap break-all"
                [class.line-through]="entry.row.kind === 'removed'"
              >
                {{ entry.row.left?.text ?? '' }}
              </span>
            </div>
            <div class="flex gap-1 px-1" [class.bg-line-40]="entry.row.kind !== 'same'">
              <span class="w-8 shrink-0 text-right text-ink-3">
                {{ entry.row.right?.number ?? '' }}
              </span>
              @if (entry.row.right) {
                <button
                  type="button"
                  class="grow text-left whitespace-pre-wrap break-all"
                  [class.font-bold]="entry.row.kind === 'added'"
                  [attr.aria-pressed]="chosen().has(entry.index)"
                  [attr.data-line]="entry.row.right.number"
                  (click)="toggle(entry.index)"
                >
                  {{ entry.row.right.text }}
                </button>
              } @else {
                <span class="grow"></span>
              }
            </div>
          </div>
        }
      </div>
    </div>
  `,
})
export class AiCodeReviewComponent {
  readonly before = input.required<string>();
  readonly after = input.required<string>();
  readonly title = input('');
  readonly accepted = output<LineChoice[] | null>();
  readonly closed = output<undefined>();

  private readonly picked = signal<ReadonlySet<number>>(new Set());
  protected readonly chosen = computed(() => this.picked());
  protected readonly all = computed(() => lineDiff(this.before(), this.after()));

  /** Every changed line, with its row index, in file order. */
  protected readonly rows = computed(() => reviewableRows(this.all()));

  protected toggle(index: number): void {
    this.picked.update((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  protected close(): void {
    this.closed.emit(undefined);
  }

  protected takeAll(): void {
    this.accepted.emit(null);
  }

  protected takeChosen(): void {
    this.accepted.emit(chosenRanges(this.picked(), this.all()));
  }
}
