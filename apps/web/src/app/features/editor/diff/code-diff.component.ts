import { DOCUMENT } from '@angular/common';
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
} from '@naucto/engine';
import { ChangeChipComponent, LooksOnlyDirective, MarkComponent } from '@naucto/ui';
import { StyleModule } from 'style-mod';

import { naucto_highlight } from '../code/theme';
import { highlightLines, type Segment, segmentsOf } from './code-highlight';
import { DiffStore } from './diff.store';
import { HunkActionsComponent } from './hunk-actions.component';

/** One drawn line of the unified view. */
interface Line {
  /** Its number in the file the change makes; a removed line has none. */
  number?: number | undefined;
  kind: DiffRow['kind'];
  /** Its text in runs drawn alike: the editor's colours, and the words a change touched. */
  segments: Segment[];
  /** The change the line belongs to, and whether it is the change's first line. */
  item: ChangeItem | null;
  first: boolean;
  decision: Decision;
}

const GLYPH: Record<DiffRow['kind'], string> = {
  same: '',
  added: '+',
  removed: '\u2212',
  changed: '~',
};

/** How a removed line or word is drawn: struck, in hot, over whatever wash it stands on. */
const GONE = 'text-hot-ink line-through';

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
  protected readonly glyphInk: Record<DiffRow['kind'], string> = {
    same: '',
    added: 'text-jade-ink',
    removed: 'text-hot-ink',
    changed: 'text-orange-ink',
  };

  constructor() {
    // The editor mounts its highlight classes with a view; this one has none.
    const module = naucto_highlight.module;
    if (module) {
      StyleModule.mount(inject(DOCUMENT), module);
    }
  }

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
      const colours = highlightLines(text);
      return text.split('\n').map((line, i) => ({
        number: i + 1,
        kind: whole.kind === 'NEW' ? 'added' : 'removed',
        segments:
          whole.kind === 'NEW'
            ? segmentsOf(line, colours[i] ?? [], 0, '')
            : segmentsOf(line, [], 0, GONE),
        item: whole,
        first: i === 0,
        decision,
      }));
    }
    const rows = this.diff.files().get(this.fileId())?.rows ?? [];
    const textOf = (side: 'left' | 'right'): string =>
      rows.flatMap((row) => (row[side] ? [row[side].text] : [])).join('\n');
    const oldColours = highlightLines(textOf('left'));
    const newColours = highlightLines(textOf('right'));
    const colourOf = (row: DiffRow, side: 'left' | 'right'): string[] => {
      const number = row[side]?.number ?? 0;
      return (side === 'left' ? oldColours : newColours)[number - 1] ?? [];
    };
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
        const side = decision === 'ok' ? 'right' : 'left';
        const held = row[side];
        if (held || first) {
          out.push({
            number: held?.number,
            kind: 'same',
            segments: held ? segmentsOf(held.text, colourOf(row, side), 0, '') : [],
            item,
            first,
            decision,
          });
        }
        return;
      }
      out.push({
        number: row.right?.number,
        kind: row.kind,
        segments: this.segmentsOfRow(row, colourOf(row, 'right')),
        item,
        first,
        decision,
      });
    });
    return out;
  });

  /**
   * A row as the editor would colour it. A changed one shows its words: those kept and those
   * added in the new line's colours, the added ones on an orange wash, the removed ones struck in
   * hot between them.
   */
  private segmentsOfRow(row: DiffRow, colours: readonly string[]): Segment[] {
    if (row.kind === 'removed') {
      return segmentsOf(row.left?.text ?? '', [], 0, GONE);
    }
    if (row.kind !== 'changed') {
      return segmentsOf(row.right?.text ?? '', colours, 0, '');
    }
    const out: Segment[] = [];
    let at = 0;
    for (const part of wordDiff(row.left?.text ?? '', row.right?.text ?? '')) {
      if (part.kind === 'removed') {
        out.push(...segmentsOf(part.text, [], 0, `${GONE} mr-[1ch] bg-hot-wash`));
        continue;
      }
      out.push(
        ...segmentsOf(part.text, colours, at, part.kind === 'added' ? 'bg-wash-orange' : ''),
      );
      at += part.text.length;
    }
    return out;
  }

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
