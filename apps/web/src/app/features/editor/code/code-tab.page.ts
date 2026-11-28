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
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import {
  ButtonDirective,
  type ChangeKind,
  DialogService,
  IconComponent,
  LooksOnlyDirective,
  MarkComponent,
  type TabItem,
  TabsComponent,
} from '@naucto/ui';

import { RuntimeHostService } from '../../../shared/game-screen/runtime-host.service';
import { ySignal } from '../../../shared/yjs/y-signal';
import { CodeDiffComponent } from '../diff/code-diff.component';
import { DiffStore } from '../diff/diff.store';
import { EditorModeService } from '../state/editor-mode.service';
import { EditorRuntimeService } from '../state/editor-runtime.service';
import { SessionPresenceService } from '../work-session/session-presence.service';
import { SessionSaveService } from '../work-session/session-save.service';
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
    LooksOnlyDirective,
    MarkComponent,
    SearchBarComponent,
    CodeEditorComponent,
    CodeDiffComponent,
  ],
  templateUrl: './code-tab.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class CodeTabPage implements OnInit {
  /**
   * Synced is a claim about the server, made only when nothing is waiting to go there: a reader
   * closing the tab trusts this word.
   */
  protected readonly syncLabel = computed(() => {
    if (this.saves.saveFailed()) {
      return 'editor.notSaved';
    }
    if (this.saves.saving()) {
      return 'editor.syncing';
    }
    return this.saves.dirty() ? 'editor.unsaved' : 'editor.synced';
  });

  protected readonly syncTone = computed(() => {
    if (this.saves.saveFailed()) {
      return 'text-hot-ink';
    }
    if (this.saves.saving()) {
      return 'text-orange-ink';
    }
    return this.saves.dirty() ? 'text-orange-ink' : 'text-jade-ink';
  });
  protected readonly session = inject(WorkSessionService);
  protected readonly mode = inject(EditorModeService);
  protected readonly diff = inject(DiffStore);
  protected readonly presence = inject(SessionPresenceService);
  private readonly saves = inject(SessionSaveService);
  protected readonly runtime = inject(RuntimeHostService);
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
      if (terms) {
        this.editor()?.setSearch(terms);
      }
    });
    // The bar only exists once the template has rendered it, so the focus waits for the query to
    // resolve.
    effect(() => {
      if (this.searching()) {
        this.bar()?.focus();
      }
    });
    // A step to a change in another file opens that file.
    effect(() => {
      const key = this.diff.currentKey();
      const change = this.diff.itemsOf('code').find((item) => item.key === key);
      if (change) {
        this.activeId.set(change.container.slice('code:'.length));
      }
    });
    inject(DestroyRef).onDestroy(() => {
      this.editorRuntime.insertAtCursor = null;
      this.editorRuntime.symbolAtCursor = null;
    });
  }

  protected readonly palette = ySignal(
    () => this.session.game.palette,
    (cb) => {
      const paletteArray = this.session.game.paletteArray;
      paletteArray.observe(cb);
      return () => {
        paletteArray.unobserve(cb);
      };
    },
  );

  protected readonly files = ySignal(
    () => this.session.game.files,
    (cb) => {
      const codeFiles = this.session.game.codeFiles;
      codeFiles.observeDeep(cb);
      return () => {
        codeFiles.unobserveDeep(cb);
      };
    },
  );
  /**
   * The project's own functions, read from every tab rather than the open one: a helper is
   * routinely called from a file other than the one that declares it.
   */
  protected readonly locals = computed(() =>
    localSignatures(this.files().map((file) => ({ name: file.name, text: file.text.toString() }))),
  );
  protected readonly activeId = signal<string | null>(null);
  protected readonly searching = signal(false);
  private readonly bar = viewChild<SearchBarComponent>('bar');
  protected readonly active = computed(
    () =>
      this.files().find((file) => file.id === this.activeId()) ??
      this.session.game.entryFile ??
      null,
  );
  protected readonly errorHere = computed(() => {
    const error = this.runtime.error();
    return error?.file !== undefined && error.file === this.active()?.name ? error : null;
  });
  protected readonly warningsHere = computed(() =>
    this.session.migrationWarnings().filter((warning) => warning.file === this.active()?.name),
  );
  protected readonly cursor = signal<CursorInfo>({ line: 1, col: 1 });

  ngOnInit(): void {
    this.activeId.set(this.session.game.entryFile?.id ?? null);
  }

  /**
   * The rank the engine loads a file in. It is the position in the strip rather than a stored
   * field, so dragging a tab renumbers it and changes what runs first.
   */
  protected readonly fileTabs = computed<TabItem<string>[]>(() => {
    const changes = this.diff.itemsOf('code');
    const kinds = new Map<string, ChangeKind>();
    const struck = new Set<string>();
    for (const change of changes) {
      if (change.type === 'code-file') {
        kinds.set(change.fileId, change.kind);
        if (change.kind === 'DELETED' && this.diff.decisionOf(change.key) === 'ok') {
          struck.add(change.fileId);
        }
      } else if (change.type === 'code-hunk' || change.type === 'code-name') {
        kinds.set(change.fileId, kinds.get(change.fileId) ?? 'EDIT');
      }
    }
    const tabs: TabItem<string>[] = this.files().map((file, i) => ({
      value: file.id,
      label: file.name,
      index: i + 1,
      colour: file.colour === null ? undefined : (this.palette()[file.colour] ?? undefined),
      change: kinds.get(file.id),
      struck: struck.has(file.id),
    }));
    // A file only the other side has: new in a proposal, or gone since a version.
    for (const change of changes) {
      if (change.type === 'code-file' && !tabs.some((tab) => tab.value === change.fileId)) {
        tabs.push({
          value: change.fileId,
          label: change.name,
          change: change.kind,
          struck: struck.has(change.fileId),
        });
      }
    }
    return tabs;
  });

  /** Whether the open file is drawn as a diff: diff mode is on and the file differs. */
  protected readonly diffShown = computed(() => {
    const id = this.activeId();
    return (
      this.diff.on() &&
      this.diff.itemsOf('code').some((change) => change.container === `code:${id ?? ''}`)
    );
  });

  protected addFile(): void {
    this.dialogs
      .open<CodeFileDialog, CodeFileDialogData, CodeFileDialogResult | undefined>(CodeFileDialog, {
        data: {
          title: this.transloco.translate('editor.code.newFile'),
          confirmLabel: this.transloco.translate('editor.code.create'),
          name: '',
          colour: null,
          palette: this.palette(),
          taken: this.files().map((file) => file.name),
        },
      })
      .closed.subscribe((result) => {
        if (!result) {
          return;
        }
        const file = this.session.game.addFile(result.name);
        if (file) {
          this.session.game.setFileColour(file.id, result.colour);
          this.activeId.set(file.id);
        }
      });
  }

  protected edit(id: string): void {
    const file = this.files().find((candidate) => candidate.id === id);
    if (!file) {
      return;
    }
    this.dialogs
      .open<CodeFileDialog, CodeFileDialogData, CodeFileDialogResult | undefined>(CodeFileDialog, {
        data: {
          title: this.transloco.translate('editor.code.renameFile'),
          confirmLabel: this.transloco.translate('editor.code.rename'),
          name: file.name,
          colour: file.colour ?? null,
          palette: this.palette(),
          taken: this.files().map((candidate) => candidate.name),
        },
      })
      .closed.subscribe((result) => {
        if (!result) {
          return;
        }
        this.session.game.renameFile(id, result.name);
        this.session.game.setFileColour(id, result.colour);
      });
  }

  protected async remove(id: string): Promise<void> {
    const confirmed = await this.dialogs.confirmDanger({
      title: this.transloco.translate('editor.code.removeTitle'),
      message: this.transloco.translate('editor.code.removeMessage'),
      confirmLabel: this.transloco.translate('editor.code.remove'),
    });
    if (!confirmed) {
      return;
    }
    this.session.game.removeFile(id);
    if (this.activeId() === id) {
      this.activeId.set(this.session.game.entryFile?.id ?? null);
    }
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
