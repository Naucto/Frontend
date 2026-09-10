import type { OnInit } from '@angular/core';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { RuntimeHostService } from '@app/shared/game-screen/runtime-host.service';
import { ySignal } from '@app/shared/yjs/y-signal';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { MAIN_FILE } from '@naucto/engine';
import {
  ButtonDirective,
  ConfirmDialogComponent,
  type ConfirmDialogData,
  DialogService,
  IconComponent,
  type TabItem,
  TabsComponent,
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
    TabsComponent,
    TranslocoDirective,
    ButtonDirective,
    IconComponent,
    SearchBarComponent,
    CodeEditorComponent,
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
          <button
            ncButton
            variant="ghost"
            size="sm"
            [attr.aria-expanded]="searching()"
            (click)="find()"
          >
            {{ t('editor.code.find') }}
          </button>
        </span>
      </nc-tabs>
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
