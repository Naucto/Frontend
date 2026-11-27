import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import {
  type ChangeItem,
  type CodeFileChange,
  type CodeHunkChange,
  type Decision,
  type DiffKind,
  type DiffRow,
  wordDiff,
  type WordPart,
} from '@naucto/engine';
import { ChangeChipComponent, LooksOnlyDirective, MarkComponent } from '@naucto/ui';

import { DiffStore } from './diff.store';
import { HunkActionsComponent } from './hunk-actions.component';

/** One drawn line of the unified view. */
interface Line {
  /** Line numbers on the old and the new side; one of them is absent on an added or removed line. */
  old?: number;
  now?: number;
  kind: DiffRow['kind'];
  /** The words of a changed line, the old and the new interleaved. */
  parts: WordPart[];
  /** The change the line belongs to, and whether it is the change's first line. */
  item: ChangeItem | null;
  first: boolean;
  decision: Decision;
}

const GLYPH: Record<DiffRow['kind'], string> = { same: '', added: '+', removed: '−', changed: '~' };

/**
 * The CODE tab's file while diff mode is on: a unified diff, as a code host draws one, with what
 * was added in jade, what was removed in hot and struck, and a changed line in orange with the
 * words that changed marked inside it. A click on a change waiting for a decision accepts it; the
 * pair on its first line rejects it or takes the decision back. Comparing two versions draws the
 * same diff and decides nothing.
 *
 * A decided change is drawn as what it decided: the new lines once accepted, the old ones once
 * rejected, with only the bar beside them still saying which.
 */
@Component({
  selector: 'nc-code-diff',
  imports: [
    TranslocoDirective,
    ChangeChipComponent,
    HunkActionsComponent,
    LooksOnlyDirective,
    MarkComponent,
  ],
  templateUrl: './code-diff.component.html',
  host: { class: 'flex h-full min-h-0 flex-col' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CodeDiffComponent {
  readonly fileId = input.required<string>();
  protected readonly diff = inject(DiffStore);
  protected readonly glyph = GLYPH;

  protected readonly review = computed(() => this.diff.mode() === 'review');
  protected readonly items = computed(() =>
    this.diff.itemsOf('code').filter((item) => item.container === `code:${this.fileId()}`),
  );
  /** The file as a whole, where it is new or gone on one side. */
  protected readonly whole = computed(
    () => this.items().find((item): item is CodeFileChange => item.type === 'code-file') ?? null,
  );
  protected readonly hunks = computed(() =>
    this.items().filter((item): item is CodeHunkChange => item.type === 'code-hunk'),
  );
  protected readonly renamed = computed(
    () => this.items().find((item) => item.type === 'code-name') ?? null,
  );
  protected readonly kind = computed<DiffKind>(() => this.whole()?.kind ?? 'EDIT');

  protected readonly lines = computed<Line[]>(() => {
    const whole = this.whole();
    const decisions = this.diff.decisions();
    if (whole) {
      const decision = decisions.get(whole.key) ?? 'pending';
      const text = whole.kind === 'NEW' ? whole.after : whole.before;
      return text.split('\n').map((line, i) => ({
        old: whole.kind === 'NEW' ? undefined : i + 1,
        now: whole.kind === 'NEW' ? i + 1 : undefined,
        kind: whole.kind === 'NEW' ? 'added' : 'removed',
        parts: [{ text: line, kind: 'same' }],
        item: whole,
        first: i === 0,
        decision,
      }));
    }
    const rows = this.diff.files().get(this.fileId())?.rows ?? [];
    const owner = new Map<number, CodeHunkChange>();
    for (const hunk of this.hunks()) {
      for (let i = hunk.hunk.start; i < hunk.hunk.end; i += 1) {
        owner.set(i, hunk);
      }
    }
    const out: Line[] = [];
    rows.forEach((row, i) => {
      const item = owner.get(i) ?? null;
      const decision = item ? (decisions.get(item.key) ?? 'pending') : 'pending';
      const first = item?.hunk.start === i;
      if (item && decision !== 'pending') {
        // Decided: the side it chose, as plain lines under the bar of its decision.
        const side = decision === 'ok' ? row.right : row.left;
        if (side || first) {
          out.push({
            old: row.left?.number,
            now: row.right?.number,
            kind: 'same',
            parts: [{ text: side?.text ?? '', kind: 'same' }],
            item,
            first,
            decision,
          });
        }
        return;
      }
      out.push({
        old: row.left?.number,
        now: row.right?.number,
        kind: row.kind,
        parts:
          row.kind === 'changed'
            ? wordDiff(row.left?.text ?? '', row.right?.text ?? '')
            : [{ text: (row.right ?? row.left)?.text ?? '', kind: 'same' }],
        item,
        first,
        decision,
      });
    });
    return out;
  });

  /** Where each change sits down the file, as a share of its height, for the overview ruler. */
  protected readonly ticks = computed(() => {
    const lines = this.lines();
    return lines
      .map((line, i) => ({ line, top: (i / Math.max(lines.length, 1)) * 100 }))
      .filter(({ line }) => line.first && line.item)
      .map(({ line, top }) => ({ key: line.item?.key ?? '', top, decision: line.decision }));
  });

  protected readonly summary = computed(() => ({
    pending: this.items().filter((item) => !this.diff.decisions().has(item.key)).length,
    lines: this.lines().length,
  }));

  protected decide(item: ChangeItem | null, decision: Decision): void {
    if (item && this.review()) {
      this.diff.currentKey.set(item.key);
      this.diff.decide([item.key], decision);
    }
  }

  /** The whole file: every change in it, or the file itself where it is new or gone. */
  protected decideFile(decision: Decision): void {
    this.diff.decide(
      this.items().map((item) => item.key),
      decision,
    );
  }

  protected fileDecision(): Decision {
    const items = this.items();
    const first = this.diff.decisionOf(items[0]?.key ?? '');
    return items.every((item) => this.diff.decisionOf(item.key) === first) ? first : 'pending';
  }

  protected rowClass(line: Line): string {
    const wash = {
      same: '',
      added: 'bg-jade-wash',
      removed: 'bg-hot-wash',
      changed: 'bg-wash-orange',
    };
    const open = this.review() && line.item && line.decision === 'pending';
    return `${wash[line.kind]} ${open ? 'cursor-pointer hover:brightness-125' : ''}`;
  }

  protected barOf(line: Line): string {
    if (!line.item) {
      return 'bg-transparent';
    }
    if (line.item.key === this.diff.currentKey()) {
      return 'bg-ink';
    }
    if (line.decision === 'ok') {
      return 'bg-jade';
    }
    if (line.decision === 'no') {
      return 'bg-hot';
    }
    return line.item.kind === 'NEW'
      ? 'bg-jade'
      : line.item.kind === 'DELETED'
        ? 'bg-hot'
        : 'bg-orange';
  }
}
