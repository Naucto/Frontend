import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  type ElementRef,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { syntaxHighlighting } from '@codemirror/language';
import { unifiedMergeView } from '@codemirror/merge';
import {
  EditorState,
  type Extension,
  Prec,
  RangeSetBuilder,
  StateEffect,
  StateField,
} from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  gutter,
  GutterMarker,
  lineNumbers,
} from '@codemirror/view';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { changedLineHunks } from '@naucto/engine';
import { ButtonDirective } from '@naucto/ui';

import { luaLanguage } from '../code/lua-language';
import { naucto_highlight, nauctoTheme } from '../code/theme';
import type { LineRange } from './ai-hunks';

/** One separate edit in the proposed file: lines of the new text, counted from zero, end exclusive. */
export interface ReviewBlock {
  from: number;
  to: number;
}

/**
 * The edits a person can take or leave, one per separate change in the file.
 *
 * Found with the same walk the Backend uses to apply a choice, so a block offered here is a block
 * the server will recognise — the alternative, deriving blocks from what the diff view happens to
 * draw, can disagree with the server at the edges, and a disagreement there is a chosen edit that
 * is refused or a refused one that is applied.
 */
export function reviewBlocks(before: string, after: string): ReviewBlock[] {
  return changedLineHunks(before, after);
}

/**
 * The chosen blocks as the API takes them.
 *
 * A deletion has no new lines, so its block is empty; sent as it is it overlaps nothing and is
 * refused. One line wide is how the API is told "this one".
 */
export function chosenBlockRanges(
  chosen: ReadonlySet<number>,
  blocks: readonly ReviewBlock[],
): LineRange[] {
  return blocks
    .filter((_, index) => chosen.has(index))
    .map((block) => ({ from: block.from, to: Math.max(block.to, block.from + 1) }));
}

/**
 * The line, 1-based, a block's toggle sits on in the proposed file.
 *
 * Its first new line; for a deletion, which has none, the line that now follows where the old lines
 * were — or the last line, when what was deleted was the end of the file.
 */
export function blockAnchorLine(block: ReviewBlock, lineCount: number): number {
  return Math.max(1, Math.min(block.from + 1, lineCount));
}

const toggleBlock = StateEffect.define<number>();
const setBlocks = StateEffect.define<ReadonlySet<number>>();

class BlockToggle extends GutterMarker {
  constructor(
    readonly index: number,
    readonly on: boolean,
    readonly label: string,
  ) {
    super();
  }

  override eq(other: GutterMarker): boolean {
    return other instanceof BlockToggle && other.index === this.index && other.on === this.on;
  }

  override toDOM(view: EditorView): HTMLElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = this.on ? 'cm-ai-block cm-ai-block-on' : 'cm-ai-block';
    button.setAttribute('aria-pressed', String(this.on));
    button.setAttribute('aria-label', this.label);
    button.title = this.label;
    button.dataset.block = String(this.index);
    button.textContent = this.on ? '✓' : '';
    // Mousedown rather than click: CodeMirror takes the mousedown for a selection, and a click
    // after that sometimes never arrives.
    button.addEventListener('mousedown', (event) => {
      event.preventDefault();
      view.dispatch({ effects: toggleBlock.of(this.index) });
    });
    button.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      view.dispatch({ effects: toggleBlock.of(this.index) });
    });
    return button;
  }
}

/**
 * A toggle beside each block of the proposed file, and the blocks left out drawn faded.
 *
 * In the editor's own gutter, next to the lines it is about, rather than in a list somewhere else:
 * a choice is made looking at the code, and a list of "block 3 of 5" is a list nobody can read
 * without scrolling back to find which block that was.
 */
function blockChooser(
  blocks: readonly ReviewBlock[],
  initial: ReadonlySet<number>,
  labels: { take: string },
  changed: (chosen: ReadonlySet<number>) => void,
): Extension {
  const chosenField = StateField.define<ReadonlySet<number>>({
    create: () => initial,
    update(value, tr) {
      let next = value;
      for (const effect of tr.effects) {
        if (effect.is(setBlocks)) next = effect.value;
        if (effect.is(toggleBlock)) {
          const set = new Set(next);
          if (set.has(effect.value)) set.delete(effect.value);
          else set.add(effect.value);
          next = set;
        }
      }
      return next;
    },
  });

  const anchors = (state: EditorState): Map<number, number> => {
    const byLineStart = new Map<number, number>();
    blocks.forEach((block, index) => {
      const line = state.doc.line(blockAnchorLine(block, state.doc.lines));
      if (!byLineStart.has(line.from)) byLineStart.set(line.from, index);
    });
    return byLineStart;
  };

  const faded = EditorView.decorations.compute([chosenField], (state): DecorationSet => {
    const chosen = state.field(chosenField);
    const builder = new RangeSetBuilder<Decoration>();
    const mark = Decoration.line({ class: 'cm-ai-skipped' });
    blocks.forEach((block, index) => {
      if (chosen.has(index)) return;
      for (let line = block.from + 1; line <= block.to && line <= state.doc.lines; line += 1) {
        const at = state.doc.line(line).from;
        builder.add(at, at, mark);
      }
    });
    return builder.finish();
  });

  return [
    chosenField,
    faded,
    gutter({
      class: 'cm-ai-blocks',
      lineMarker(view, line) {
        const index = anchors(view.state).get(line.from);
        if (index === undefined) return null;
        const on = view.state.field(chosenField).has(index);
        // One name for both states: aria-pressed already says whether it is on, and a name that
        // flipped with it read as a double negative — "leave this edit out, pressed".
        return new BlockToggle(index, on, labels.take);
      },
      lineMarkerChange: (update) =>
        update.startState.field(chosenField) !== update.state.field(chosenField),
      initialSpacer: () => new BlockToggle(-1, false, ''),
    }),
    EditorView.updateListener.of((update) => {
      const before = update.startState.field(chosenField);
      const after = update.state.field(chosenField);
      if (before !== after) changed(after);
    }),
  ];
}

/**
 * The diff in the house colours rather than the library's.
 *
 * The merge view ships light-green and light-red washes chosen for a white editor; on this one they
 * read as highlighter pen. These are the jade and hot tokens the rest of the app uses for "added"
 * and "gone", at the strength the editor uses for its own washes.
 */
const reviewTheme = Prec.highest(
  EditorView.theme({
    '&': { height: '100%' },
    '.cm-scroller': { overflow: 'auto' },
    // What goes: the original lines, drawn above the lines that replace them, in the "hot" red.
    '& .cm-deletedChunk, & .cm-deletedLine': {
      backgroundColor: 'color-mix(in srgb, var(--nc-hot) 14%, transparent)',
    },
    '& .cm-deletedText': {
      backgroundColor: 'color-mix(in srgb, var(--nc-hot) 34%, transparent)',
      textDecoration: 'line-through',
    },
    // What comes: the proposed lines, in jade.
    '& .cm-line.cm-changedLine, & .cm-line.cm-insertedLine': {
      backgroundColor: 'color-mix(in srgb, var(--nc-jade) 14%, transparent)',
    },
    '& .cm-changedText, & .cm-insertedText': {
      backgroundColor: 'color-mix(in srgb, var(--nc-jade) 34%, transparent)',
    },
    '& .cm-gutterElement.cm-changedLineGutter': { backgroundColor: 'var(--nc-jade)' },
    '& .cm-gutterElement.cm-deletedLineGutter': { backgroundColor: 'var(--nc-hot)' },
    '& .cm-collapsedLines': {
      color: 'var(--nc-ink-3)',
      backgroundColor: 'var(--nc-sunken)',
      backgroundImage: 'none',
      fontFamily: 'var(--font-ui)',
    },
    // A block left out: still readable, plainly not part of what will be applied.
    '& .cm-line.cm-ai-skipped': {
      backgroundColor: 'transparent',
      opacity: '0.45',
      textDecoration: 'line-through',
    },
    '.cm-ai-blocks .cm-gutterElement': {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '0 4px',
    },
    '.cm-ai-block': {
      width: '14px',
      height: '14px',
      padding: '0',
      border: '1px solid var(--nc-line-strong)',
      borderRadius: '2px',
      backgroundColor: 'transparent',
      color: 'var(--nc-paper)',
      font: '10px/12px var(--font-ui)',
      cursor: 'pointer',
    },
    '.cm-ai-block-on': { backgroundColor: 'var(--nc-jade)', borderColor: 'var(--nc-jade)' },
    '.cm-ai-block:focus-visible': { outline: '2px solid var(--nc-gold)', outlineOffset: '1px' },
  }),
);

/** The real editor's language, colours and line numbers, and no typing. */
const sideExtensions: Extension[] = [
  lineNumbers(),
  luaLanguage,
  syntaxHighlighting(naucto_highlight),
  nauctoTheme,
  reviewTheme,
  EditorState.tabSize.of(2),
  EditorState.readOnly.of(true),
  EditorView.editable.of(false),
];

/**
 * A change, shown the way Copilot shows one: the file as the assistant proposes it, with what goes
 * struck through in red above what replaces it in green, the unchanged stretches folded away.
 *
 * Meant to sit at the right of the editor, so the file being worked on stays where it is and the
 * change is read beside it. Each separate edit has a toggle in the gutter, all on to begin with —
 * the usual decision is "yes, except that one", and starting from nothing made the common case the
 * most work. Accept all takes the whole change, including any other files it touches; accept chosen
 * takes the ticked blocks of this file. Refuse declines it; closing leaves it waiting.
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
        <p class="label">
          {{ t('ai.review.blocksChosen', { chosen: chosen().size, total: blocks().length }) }}
        </p>
        <button ncButton variant="secondary" size="sm" (click)="takeAll()">
          {{ t('ai.review.acceptAll') }}
        </button>
        <button
          ncButton
          variant="secondary"
          size="sm"
          [disabled]="!chosen().size || chosen().size === blocks().length"
          (click)="takeChosen()"
        >
          {{ t('ai.review.acceptChosen', { count: chosen().size }) }}
        </button>
        <button ncButton variant="ghost" size="sm" (click)="refused.emit(undefined)">
          {{ t('ai.review.refuse') }}
        </button>
        <button ncButton variant="ghost" size="sm" (click)="closed.emit(undefined)">
          {{ t('ai.review.close') }}
        </button>
      </div>
      <div #host class="min-h-0 grow" data-testid="ai-code-review"></div>
    </div>
  `,
})
export class AiCodeReviewComponent {
  readonly before = input.required<string>();
  readonly after = input.required<string>();
  readonly title = input('');
  /** Null for the whole change; otherwise the chosen blocks of this file, as the API takes them. */
  readonly accepted = output<LineRange[] | null>();
  /** Declined outright. Not a silent close: a change nobody looked at is still a change waiting. */
  readonly refused = output<undefined>();
  readonly closed = output<undefined>();

  private readonly host = viewChild<ElementRef<HTMLElement>>('host');
  private readonly i18n = inject(TranslocoService);
  private view: EditorView | null = null;

  protected readonly blocks = computed(() => reviewBlocks(this.before(), this.after()));
  protected readonly chosen = signal<ReadonlySet<number>>(new Set());

  constructor() {
    effect(() => {
      const host = this.host()?.nativeElement;
      const before = this.before();
      const after = this.after();
      const blocks = this.blocks();
      if (!host) return;
      untracked(() => {
        this.mount(host, before, after, blocks);
      });
    });
    inject(DestroyRef).onDestroy(() => {
      this.view?.destroy();
      this.view = null;
    });
  }

  private mount(
    host: HTMLElement,
    before: string,
    after: string,
    blocks: readonly ReviewBlock[],
  ): void {
    this.view?.destroy();
    const all = new Set(blocks.map((_, index) => index));
    this.chosen.set(all);
    const labels = { take: this.i18n.translate('ai.review.takeBlock') };
    // The proposed file is the document and the current one is what it is compared against, so the
    // line numbers a block's toggle sits on are the proposed file's own, which is what the API takes.
    this.view = new EditorView({
      parent: host,
      doc: after,
      extensions: [
        ...sideExtensions,
        unifiedMergeView({
          original: before,
          gutter: true,
          highlightChanges: true,
          mergeControls: false,
          collapseUnchanged: { margin: 3, minSize: 6 },
        }),
        blockChooser(blocks, all, labels, (chosen) => {
          this.chosen.set(chosen);
        }),
      ],
    });
    // CodeMirror marks every gutter aria-hidden, which suits line numbers and not this one: it holds
    // the only controls for choosing an edit, and a button inside an aria-hidden region is one a
    // screen reader cannot find and a keyboard can still land on.
    this.view.dom.querySelector('.cm-ai-blocks')?.removeAttribute('aria-hidden');
    this.view.dom.style.height = '100%';
    this.view.dom.style.backgroundColor = 'var(--nc-paper)';
  }

  protected takeAll(): void {
    this.accepted.emit(null);
  }

  protected takeChosen(): void {
    this.accepted.emit(chosenBlockRanges(this.chosen(), this.blocks()));
  }
}
