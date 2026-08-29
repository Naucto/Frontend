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
import { TranslocoDirective } from '@jsverse/transloco';
import { MAIN_FILE } from '@naucto/engine';
import { ButtonDirective, IconComponent } from '@naucto/ui';

import { EditorRuntimeService } from '../state/editor-runtime.service';
import { WorkSessionService } from '../work-session/work-session.service';
import { CodeEditorComponent, type CursorInfo } from './code-editor.component';

/** CODE tab: file tabs, the collaborative editor, status bar. */
@Component({
  selector: 'nc-code-tab-page',
  imports: [TranslocoDirective, ButtonDirective, IconComponent, CodeEditorComponent],
  template: `
    <div *transloco="let t" class="flex h-full flex-col">
      <div class="flex h-5 items-stretch border-b border-line bg-panel">
        @for (f of files(); track f.id) {
          <div
            role="tab"
            tabindex="0"
            [attr.aria-selected]="f.id === activeId()"
            class="group flex cursor-pointer items-center gap-1 border-t-2 border-r border-r-line px-[15px] font-ui text-body tracking-[0.03em] hover:text-ink"
            [class]="
              f.id === activeId()
                ? 'border-t-gold bg-paper text-ink'
                : 'border-t-transparent text-ink-3'
            "
            (click)="activeId.set(f.id)"
            (keydown.enter)="activeId.set(f.id)"
            (dblclick)="rename(f.id, f.name)"
          >
            {{ f.name }}
            @if (f.id === activeId() && session.dirty()) {
              <span class="h-[6px] w-[6px] rounded-full bg-orange" aria-hidden="true"></span>
            }
            @if (files().length > 1 && f.name !== main) {
              <button
                type="button"
                class="ml-0.5 hidden text-ink-4 group-hover:inline hover:text-hot-ink"
                aria-label="Remove file"
                (click)="remove(f.id, $event)"
              >
                <nc-icon name="close" [size]="12" />
              </button>
            }
          </div>
        }
        <button
          ncButton
          variant="ghost"
          size="sm"
          iconOnly
          [attr.aria-label]="t('editor.code.addFile')"
          (click)="addFile()"
        >
          <nc-icon name="plus" [size]="12" />
        </button>
        <span class="flex-1"></span>
        <button ncButton variant="ghost" size="sm" (click)="find()">
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
            (cursor)="cursor.set($event)"
          />
        }
      </div>
      <div
        class="flex h-3 items-center gap-3 border-t border-line bg-panel px-2 font-mono text-label text-ink-3 uppercase"
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
        <span
          class="flex items-center gap-0.5"
          [class]="session.synced() ? 'text-jade-ink' : 'text-orange'"
        >
          <span class="inline-block h-1 w-1 bg-current"></span>
          {{ session.synced() ? t('editor.synced') : t('editor.syncing') }}
        </span>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CodeTabPage implements OnInit {
  protected readonly session = inject(WorkSessionService);
  protected readonly runtime = inject(RuntimeHostService);
  protected readonly main = MAIN_FILE;
  private readonly editor = viewChild<CodeEditorComponent>('editor');
  private readonly editorRuntime = inject(EditorRuntimeService);

  constructor() {
    // The DOC pane inserts snippets at the caret while this tab is open.
    effect(() => {
      const ed = this.editor();
      this.editorRuntime.insertAtCursor = ed ? (text): boolean => ed.insert(text) : null;
      this.editorRuntime.symbolAtCursor = ed ? (): string | null => ed.symbolAtCursor() : null;
    });
    inject(DestroyRef).onDestroy(() => {
      this.editorRuntime.insertAtCursor = null;
      this.editorRuntime.symbolAtCursor = null;
    });
  }

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
  protected readonly activeId = signal<string | null>(null);
  protected readonly active = computed(
    () => this.files().find((f) => f.id === this.activeId()) ?? this.session.game.entryFile ?? null,
  );
  protected readonly cursor = signal<CursorInfo>({ line: 1, col: 1 });

  ngOnInit(): void {
    this.activeId.set(this.session.game.entryFile?.id ?? null);
  }

  protected addFile(): void {
    const name = prompt('File name', `file${String(this.files().length)}.lua`)?.trim();
    if (!name) return;
    const f = this.session.game.addFile(name.endsWith('.lua') ? name : `${name}.lua`);
    this.activeId.set(f.id);
  }

  protected rename(id: string, current: string): void {
    if (current === MAIN_FILE) return;
    const name = prompt('Rename file', current)?.trim();
    if (name) this.session.game.renameFile(id, name.endsWith('.lua') ? name : `${name}.lua`);
  }

  protected remove(id: string, e: Event): void {
    e.stopPropagation();
    if (!confirm('Remove this file? Collaborators lose it too.')) return;
    this.session.game.removeFile(id);
    if (this.activeId() === id) this.activeId.set(this.session.game.entryFile?.id ?? null);
  }

  protected find(): void {
    this.editor()?.openSearch();
  }
}
