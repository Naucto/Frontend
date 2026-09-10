import { CdkDrag, type CdkDragDrop, CdkDropList } from '@angular/cdk/drag-drop';
import type { ElementRef, OnInit } from '@angular/core';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import { RuntimeHostService } from '@app/shared/game-screen/runtime-host.service';
import { ySignal } from '@app/shared/yjs/y-signal';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { type CodeFile, MAIN_FILE } from '@naucto/engine';
import {
  ButtonDirective,
  ConfirmDialogComponent,
  type ConfirmDialogData,
  DialogService,
  IconComponent,
} from '@naucto/ui';

import { ACCENT_SLOTS } from '../accent-slots';
import { EditorRuntimeService } from '../state/editor-runtime.service';
import { WorkSessionService } from '../work-session/work-session.service';
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
    CdkDropList,
    CdkDrag,
    TranslocoDirective,
    ButtonDirective,
    IconComponent,
    SearchBarComponent,
    CodeEditorComponent,
  ],
  template: `
    <div *transloco="let t" class="flex h-full flex-col">
      <div class="flex h-(--nc-bar-h) items-stretch border-b border-line bg-panel">
        <!-- The tabs scroll, the two buttons do not: past nine or ten files the strip used to
             shrink every tab until its name was cut, and the last one disappeared under FIND. -->
        <div
          class="flex min-w-0 items-stretch overflow-x-auto"
          cdkDropList
          cdkDropListOrientation="horizontal"
          (cdkDropListDropped)="moved($event)"
        >
          @for (f of files(); track f.id) {
            <!-- Named rather than read from its contents: what a tab is called must not change
                 because it grew a colour swatch, a dirty mark or a button to close it. -->
            <div
              #tab
              cdkDrag
              role="tab"
              tabindex="0"
              [attr.aria-selected]="f.id === activeId()"
              [attr.aria-label]="f.name"
              class="group flex shrink-0 cursor-pointer items-center gap-1 border-t-2 border-r border-r-line px-[15px] font-ui text-body tracking-copy hover:text-ink"
              [class]="
                f.id === activeId()
                  ? 'border-t-gold bg-paper text-ink'
                  : 'border-t-transparent text-ink-3'
              "
              [style.borderTopColor]="capOf(f)"
              (click)="activeId.set(f.id)"
              (keydown.enter)="activeId.set(f.id)"
              (dblclick)="edit(f.id, f.name)"
            >
              <!-- The rank the engine will load this file in. The strip's order is the evaluation
                   order, so the number is the position in the strip rather than a stored field —
                   dragging a tab renumbers it and changes what runs first. -->
              <span class="font-mono text-meta tabular-nums" [style.color]="capOf(f)">
                {{ $index + 1 }}
              </span>
              {{ f.name }}
              <button
                type="button"
                class="ml-0.5 hidden text-ink-4 group-hover:inline hover:text-ink"
                [attr.aria-label]="t('editor.code.edit')"
                (click)="edit(f.id, f.name, $event)"
              >
                <nc-icon name="edit" [size]="24" />
              </button>
              @if (files().length > 1) {
                <button
                  type="button"
                  class="ml-0.5 hidden text-ink-4 group-hover:inline hover:text-hot-ink"
                  aria-label="Remove file"
                  (click)="remove(f.id, $event)"
                >
                  <nc-icon name="close" [size]="24" />
                </button>
              }
            </div>
          }
        </div>
        <!-- Centred by hand: the strip stretches its children so a tab can carry its coloured cap
             the full height of the row, and a button with a height of its own then sits at the top
             of it instead of on the tabs' own line. -->
        <button
          ncButton
          variant="ghost"
          size="sm"
          iconOnly
          class="ml-1.5 shrink-0 self-center"
          [attr.aria-label]="t('editor.code.addFile')"
          (click)="addFile()"
        >
          <nc-icon name="plus" [size]="24" />
        </button>
        <span class="flex-1"></span>
        <button
          ncButton
          variant="ghost"
          size="sm"
          class="mr-1.5 shrink-0 self-center"
          [attr.aria-expanded]="searching()"
          (click)="find()"
        >
          {{ t('editor.code.find') }}
        </button>
      </div>
      <div class="min-h-0 flex-1">
        @if (active(); as file) {
          <nc-code-editor
            #editor
            [text]="file.text"
            [awareness]="session.awareness"
            [colour]="session.myColour()"
            [userName]="session.displayName"
            [error]="runtime.error()"
            [locals]="locals()"
            (cursor)="cursor.set($event)"
            (findRequested)="openSearch()"
          />
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
  protected readonly runtime = inject(RuntimeHostService);
  protected readonly main = MAIN_FILE;
  protected readonly accents = ACCENT_SLOTS;
  protected readonly editor = viewChild<CodeEditorComponent>('editor');
  private readonly tabs = viewChildren<ElementRef<HTMLElement>>('tab');
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
    // The tab that is active is not always the one that was clicked: adding a file, removing one or
    // dropping a drag can leave it outside the track, and a strip you have to scroll to find the
    // file you are editing is not telling you where you are.
    effect(() => {
      const active = this.activeId();
      const index = this.files().findIndex((f) => f.id === active);
      this.tabs()[index]?.nativeElement.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
    inject(DestroyRef).onDestroy(() => {
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

  ngOnInit(): void {
    this.activeId.set(this.session.game.entryFile?.id ?? null);
  }

  /** The cap does not say which tab is current, so the current one is not a case here. */
  protected capOf(file: CodeFile): string | null {
    if (file.colour === null) return null;
    return this.palette()[file.colour] ?? null;
  }

  protected moved(e: CdkDragDrop<unknown>): void {
    const ids = this.files().map((f) => f.id);
    const [moved] = ids.splice(e.previousIndex, 1);
    if (moved === undefined) return;
    ids.splice(e.currentIndex, 0, moved);
    this.session.game.reorderFiles(ids);
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

  protected edit(id: string, current: string, e?: Event): void {
    e?.stopPropagation();
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

  protected remove(id: string, e: Event): void {
    e.stopPropagation();
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
