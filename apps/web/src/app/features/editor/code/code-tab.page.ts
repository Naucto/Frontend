import type { OnInit } from '@angular/core';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { unwrap } from '@app/core/api/api-errors';
import { RuntimeHostService } from '@app/shared/game-screen/runtime-host.service';
import { ySignal } from '@app/shared/yjs/y-signal';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import {
  aiControllerList,
  aiControllerReview,
  type AiProposalResponseDto,
} from '@naucto/api-client';
import { MAIN_FILE } from '@naucto/engine';
import {
  ButtonDirective,
  ConfirmDialogComponent,
  type ConfirmDialogData,
  DialogService,
  IconComponent,
  NoticeComponent,
  type TabItem,
  TabsComponent,
} from '@naucto/ui';

import { ACCENT_SLOTS } from '../accent-slots';
import { AiCodeReviewComponent } from '../ai/ai-code-review.component';
import type { LineRange } from '../ai/ai-hunks';
import { EditorRuntimeService } from '../state/editor-runtime.service';
import { WorkSessionService } from '../work-session/work-session.service';

/** A staged change to one file, as the split review needs it. */
export interface ReviewChange {
  id: string;
  contentHash: string;
  title: string;
  fileId: string;
  before: string;
  after: string;
}
import { CodeEditorComponent, type CursorInfo } from './code-editor.component';
import {
  CodeFileDialog,
  type CodeFileDialogData,
  type CodeFileDialogResult,
} from './code-file.dialog';
import { SearchBarComponent } from './search-bar.component';
import { localSignatures } from './signature-help';

/** CODE tab: file tabs, the collaborative editor, status bar. */
@Component({
  selector: 'nc-code-tab-page',
  imports: [
    TabsComponent,
    TranslocoDirective,
    ButtonDirective,
    IconComponent,
    SearchBarComponent,
    CodeEditorComponent,
    AiCodeReviewComponent,
    NoticeComponent,
  ],
  template: `
    <div *transloco="let t" class="flex h-full flex-col">
      <nc-tabs
        variant="bar"
        [editable]="true"
        [removable]="true"
        [reorderable]="true"
        [tabs]="fileTabs()"
        [value]="activeId() ?? ''"
        (valueChange)="activeId.set($event ?? null)"
        (edit)="editTab($event)"
        (remove)="remove($event)"
        (reorder)="session.game.reorderFiles($event)"
        [label]="t('editor.code.files')"
        [editLabel]="t('editor.code.edit')"
        [removeLabel]="t('editor.code.removeFile')"
      >
        <span actions class="flex items-center gap-1.5 pr-1.5">
          <button
            ncButton
            variant="ghost"
            size="sm"
            iconOnly
            [attr.aria-label]="t('editor.code.addFile')"
            (click)="addFile()"
          >
            <nc-icon name="plus" [size]="24" />
          </button>
          <!-- A glyph, beside the plus: it was the one control in this strip still spelled out,
               which read as a label rather than as the pair of buttons it belongs to. The word
               stays as its accessible name. -->
          <button
            ncButton
            variant="ghost"
            size="sm"
            iconOnly
            [attr.aria-expanded]="searching()"
            [attr.aria-label]="t('editor.code.find')"
            (click)="find()"
          >
            <nc-icon name="search" [size]="24" />
          </button>
        </span>
      </nc-tabs>
      @if (reviewError()) {
        <nc-notice tone="danger" role="alert" class="m-1">{{ reviewError() }}</nc-notice>
      }
      @if (!review() && waitingFor().length) {
        <!-- In the editor, not in a panel elsewhere: a change is judged against the file it lands
             in, and a badge you have to go and find is a change that gets applied unread. -->
        <div class="flex items-center gap-1.5 border-b border-line bg-line-20 px-1.5 py-1">
          <p class="label grow truncate">
            {{ t('ai.review.waiting', { count: waitingFor().length }) }}
          </p>
          @for (change of waitingFor(); track change.id + change.fileId) {
            <button ncButton variant="secondary" size="sm" (click)="reviewChange(change)">
              {{ t('ai.review.openNamed', { name: change.fileId }) }}
            </button>
          }
        </div>
      }
      <div class="flex min-h-0 flex-1">
        <div class="min-h-0 min-w-0 flex-1">
          @if (active(); as file) {
            <nc-code-editor
              #editor
              [text]="file.text"
              [awareness]="session.awareness"
              [colour]="session.myColour()"
              [userName]="session.displayName"
              [error]="runtime.error()"
              [locals]="locals()"
              [aiMarks]="marksHere()"
              (cursor)="cursor.set($event)"
              (findRequested)="openSearch()"
            />
          }
        </div>
        @if (review(); as underReview) {
          <!-- Beside the editor, as Copilot does it: the file you are working on stays where it is and
               the change is read at its right, what goes struck through in red and what replaces it in
               green. Closing leaves the change waiting; the strip above brings it back. -->
          <aside class="min-h-0 w-1/2 min-w-0 border-l border-line" data-testid="ai-review-pane">
            <nc-ai-code-review
              [before]="underReview.before"
              [after]="underReview.after"
              [title]="underReview.title"
              (accepted)="take($event, underReview)"
              (refused)="refuse(underReview)"
              (closed)="dismiss(underReview)"
            />
          </aside>
        }
      </div>
      @if (searching()) {
        <nc-search-bar
          #bar
          (next)="editor()?.findNext()"
          (previous)="editor()?.findPrevious()"
          (selectAll)="editor()?.selectAllMatches()"
          (replaceOne)="editor()?.replaceOne()"
          (replaceEvery)="editor()?.replaceEvery()"
          (closed)="searching.set(false)"
        />
      }
      <div
        class="flex h-3 items-center gap-3 border-t border-line bg-panel px-2 font-mono text-meta tracking-tag text-ink-3 uppercase"
      >
        <span>LN {{ cursor().line }} · COL {{ cursor().col }}</span>
        <span>SPACES 2</span>
        <!-- An icon, not a literal ◇: HD44780 carries neither that nor ■, so both fell back to
             whatever font the browser reached for next. -->
        @if (runtime.error()) {
          <span class="flex items-center gap-0.5 text-hot-ink">
            <nc-icon name="alert" [size]="12" />
            {{ t('editor.oneError') }}
          </span>
        }
        <span class="flex-1"></span>
        <!-- Three states, because a write in flight and a write that was refused are not the same
             news: one is worth waiting through, the other is worth acting on. -->
        <span role="status" class="flex items-center gap-0.5" [class]="syncTone()">
          <span class="inline-block h-1 w-1 bg-current"></span>
          {{ t(syncLabel()) }}
        </span>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CodeTabPage implements OnInit {
  /**
   * Synced is a claim about the server, so it may only be made when nothing is waiting to go there.
   * The strip said it on a document with unwritten edits, which is the one reading that matters:
   * a reader closing the tab trusts this word.
   */
  protected readonly syncLabel = computed(() => {
    if (this.session.saveFailed()) return 'editor.notSaved';
    if (this.session.saving()) return 'editor.syncing';
    return this.session.dirty() ? 'editor.unsaved' : 'editor.synced';
  });

  protected readonly syncTone = computed(() => {
    if (this.session.saveFailed()) return 'text-hot-ink';
    if (this.session.saving()) return 'text-orange-ink';
    return this.session.dirty() ? 'text-orange-ink' : 'text-jade-ink';
  });
  protected readonly session = inject(WorkSessionService);

  /**
   * The change being reviewed, if any, as the two versions of one file.
   *
   * Held here rather than in the proposals panel because it is a way of reading code, not a list:
   * an edit cannot be judged against a proposal's summary, only against the file it lands in.
   */
  protected readonly review = signal<ReviewChange | null>(null);

  /** Changes whose pane was closed, so they are not put back in front of somebody who closed them. */
  private readonly dismissed = signal<ReadonlySet<string>>(new Set());

  protected reviewChange(change: ReviewChange): void {
    this.dismissed.update((current) => {
      const next = new Set(current);
      next.delete(`${change.id}:${change.fileId}`);
      return next;
    });
    this.review.set(change);
  }

  /** Closing says "not now": the change keeps waiting and the strip above can reopen it. */
  protected dismiss(change: ReviewChange): void {
    this.dismissed.update((current) => new Set(current).add(`${change.id}:${change.fileId}`));
    this.review.set(null);
  }

  /**
   * Declines the change outright, review closed or not.
   *
   * Refusing is not the same as closing. Closing says "not now" and leaves the change waiting to be
   * applied; refusing is a decision, and nothing should let one be mistaken for the other — least of
   * all by leaving a change sitting there that somebody believed they had looked at.
   */
  protected async refuse(change: ReviewChange): Promise<void> {
    this.dismiss(change);
    unwrap(
      await aiControllerReview({
        path: { projectId: this.session.id, proposalId: change.id },
        body: { decision: 'REJECTED', contentHash: change.contentHash },
      }),
    );
    await this.loadWaiting();
  }

  /** Changes waiting on the file in front of you, so the review is offered where the code is. */
  private readonly waiting = signal<ReviewChange[]>([]);
  private waitingPoll: ReturnType<typeof setInterval> | null = null;

  /** Only the ones for the file in front of you: a change to another file is not in this window. */
  protected readonly waitingFor = computed(() => {
    const file = this.activeId();
    return this.waiting().filter((change) => change.fileId === file);
  });

  protected async loadWaiting(): Promise<void> {
    const changes = await aiControllerList({ path: { projectId: this.session.id } })
      .then(unwrap)
      .then((all: AiProposalResponseDto[]) =>
        all.filter((proposal) => proposal.status === 'PENDING'),
      )
      .then((all) => all.flatMap((proposal) => this.asReviewChange(proposal)));

    this.waiting.set(changes);
  }

  /**
   * A proposal as a review, for the file it touches.
   *
   * Only the code operations: a sprite sheet, a map or a sound has no side-by-side text to read, and
   * pretending otherwise would put a pane of binary in front of somebody asking what changed.
   */
  private asReviewChange(proposal: AiProposalResponseDto): ReviewChange[] {
    return (proposal.operations ?? [])
      .filter(
        (op): op is { kind: 'code'; fileId: string; before: string; after: string } =>
          !!op && typeof op === 'object' && (op as { kind?: unknown }).kind === 'code',
      )
      .map((op) => ({
        id: proposal.id,
        contentHash: proposal.contentHash,
        title: proposal.title,
        fileId: op.fileId,
        before: op.before,
        after: op.after,
      }));
  }

  /**
   * Applies what was taken: null for the whole change, or the lines that were chosen.
   *
   * The review closes either way — the decision has been made, and leaving it up would invite a
   * second one about the same lines.
   */
  protected async take(chosen: LineRange[] | null, change: ReviewChange): Promise<void> {
    this.dismiss(change);
    this.reviewError.set('');
    try {
      await this.session.applyAiProposal(change.id, change.contentHash, {
        title: change.title,
        hunks: chosen?.map((range) => ({ fileId: change.fileId, ...range })) ?? [],
      });
    } catch (error) {
      // Said where the change was, and put back in front of the person: a refusal usually means the
      // file moved underneath it, and a change that vanished without a word would read as applied.
      this.reviewError.set(error instanceof Error ? error.message : String(error));
      this.reviewChange(change);
    }
    await this.loadWaiting().catch(() => undefined);
  }

  /** Why the last accept did not go through, if it did not. */
  protected readonly reviewError = signal('');
  protected readonly runtime = inject(RuntimeHostService);
  protected readonly main = MAIN_FILE;
  protected readonly accents = ACCENT_SLOTS;
  protected readonly editor = viewChild<CodeEditorComponent>('editor');
  private readonly editorRuntime = inject(EditorRuntimeService);
  private readonly dialogs = inject(DialogService);
  private readonly transloco = inject(TranslocoService);

  constructor() {
    // The DOC pane inserts snippets at the caret while this tab is open.
    effect(() => {
      const ed = this.editor();
      this.editorRuntime.insertAtCursor = ed ? (text): boolean => ed.insert(text) : null;
      this.editorRuntime.symbolAtCursor = ed ? (): string | null => ed.symbolAtCursor() : null;
    });
    effect(() => {
      const terms = this.bar()?.terms();
      if (terms) this.editor()?.setSearch(terms);
    });
    // The bar is created by the @if above, so nothing can focus it in the same turn that opens it.
    effect(() => {
      if (this.searching()) this.bar()?.focus();
    });
    // A change waiting on the file in front of you opens at the right of it by itself: a change that
    // needs a click to be seen is one that gets applied, or ignored, unread.
    effect(() => {
      const current = this.review();
      const waiting = this.waitingFor();
      const dismissed = this.dismissed();
      untracked(() => {
        // Still waiting: keep it. Gone (applied, refused, or another file's): move on or close.
        if (current && waiting.some((w) => w.id === current.id && w.fileId === current.fileId)) {
          const fresh = waiting.find((w) => w.id === current.id && w.fileId === current.fileId);
          if (fresh && (fresh.before !== current.before || fresh.after !== current.after))
            this.review.set(fresh);
          return;
        }
        const next = waiting.find((w) => !dismissed.has(`${w.id}:${w.fileId}`));
        this.review.set(next ?? null);
      });
    });
    // A staged change is looked for when the session is ready, and on an interval after that, for
    // the same reason the proposals panel does: it has to turn up by itself, while you are working,
    // rather than when you think to go and refresh something.
    effect(() => {
      if (this.session.status() !== 'ready') return;
      untracked(() => void this.loadWaiting());
      if (this.waitingPoll) return;
      this.waitingPoll = setInterval(() => {
        if (document.visibilityState === 'visible' && this.session.status() === 'ready') {
          untracked(() => void this.loadWaiting());
        }
      }, 5000);
    });
    inject(DestroyRef).onDestroy(() => {
      if (this.waitingPoll) clearInterval(this.waitingPoll);
      this.editorRuntime.insertAtCursor = null;
      this.editorRuntime.symbolAtCursor = null;
    });
  }

  protected readonly palette = ySignal(
    () => this.session.game.palette,
    (cb) => {
      const a = this.session.game.paletteArray;
      a.observe(cb);
      return () => {
        a.unobserve(cb);
      };
    },
  );

  protected readonly files = ySignal(
    () => this.session.game.files,
    (cb) => {
      const m = this.session.game.codeFiles;
      m.observeDeep(cb);
      return () => {
        m.unobserveDeep(cb);
      };
    },
  );
  /**
   * The project's own functions, read from every tab rather than the open one: a helper is
   * routinely called from a file other than the one that declares it.
   */
  protected readonly locals = computed(() =>
    localSignatures(this.files().map((f) => ({ name: f.name, text: f.text.toString() }))),
  );
  protected readonly activeId = signal<string | null>(null);
  protected readonly searching = signal(false);
  private readonly bar = viewChild<SearchBarComponent>('bar');
  protected readonly active = computed(
    () => this.files().find((f) => f.id === this.activeId()) ?? this.session.game.entryFile ?? null,
  );
  protected readonly cursor = signal<CursorInfo>({ line: 1, col: 1 });
  /**
   * Accepted assistant changes in the open file. Filtered here rather than in the editor so the
   * marks of a change to another file are not even offered to it.
   */
  protected readonly marksHere = computed(() => {
    const id = this.active()?.id;
    return id === null || id === undefined
      ? []
      : this.session.aiMarks().filter((mark) => mark.fileId === id);
  });

  ngOnInit(): void {
    this.activeId.set(this.session.game.entryFile?.id ?? null);
  }

  /**
   * The rank the engine loads a file in. It is the position in the strip rather than a stored
   * field, so dragging a tab renumbers it and changes what runs first.
   */
  protected readonly fileTabs = computed<TabItem<string>[]>(() =>
    this.files().map((f, i) => ({
      value: f.id,
      label: f.name,
      index: i + 1,
      colour: f.colour === null ? undefined : (this.palette()[f.colour] ?? undefined),
    })),
  );

  /** The strip knows an id; the dialog wants the name that goes with it. */
  protected editTab(id: string): void {
    const file = this.files().find((f) => f.id === id);
    if (file) this.edit(file.id, file.name);
  }

  protected addFile(): void {
    this.dialogs
      .open<CodeFileDialog, CodeFileDialogData, CodeFileDialogResult | undefined>(CodeFileDialog, {
        data: {
          title: this.transloco.translate('editor.code.newFile'),
          confirmLabel: this.transloco.translate('editor.code.create'),
          name: '',
          colour: null,
          palette: this.palette(),
          taken: this.files().map((f) => f.name),
        },
      })
      .closed.subscribe((r) => {
        if (!r) return;
        const f = this.session.game.addFile(r.name);
        this.session.game.setFileColour(f.id, r.colour);
        this.activeId.set(f.id);
      });
  }

  private edit(id: string, current: string): void {
    const file = this.files().find((f) => f.id === id);
    this.dialogs
      .open<CodeFileDialog, CodeFileDialogData, CodeFileDialogResult | undefined>(CodeFileDialog, {
        data: {
          title: this.transloco.translate('editor.code.renameFile'),
          confirmLabel: this.transloco.translate('editor.code.rename'),
          name: current,
          colour: file?.colour ?? null,
          palette: this.palette(),
          taken: this.files().map((f) => f.name),
        },
      })
      .closed.subscribe((r) => {
        if (!r) return;
        this.session.game.renameFile(id, r.name);
        this.session.game.setFileColour(id, r.colour);
      });
  }

  protected remove(id: string): void {
    this.dialogs
      .open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, {
        data: {
          title: this.transloco.translate('editor.code.removeTitle'),
          message: this.transloco.translate('editor.code.removeMessage'),
          confirmLabel: this.transloco.translate('editor.code.remove'),
          danger: true,
        },
      })
      .closed.subscribe((ok) => {
        if (!ok) return;
        this.session.game.removeFile(id);
        if (this.activeId() === id) this.activeId.set(this.session.game.entryFile?.id ?? null);
      });
  }

  protected find(): void {
    this.searching.set(!this.searching());
  }

  /** Mod-f asks for a search, never for the absence of one, so it opens where the button toggles. */
  protected openSearch(): void {
    this.searching.set(true);
    this.bar()?.focus();
  }
}
