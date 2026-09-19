import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { ApiCardComponent } from '@app/shared/docs/api-card.component';
import { DocArticleComponent } from '@app/shared/docs/doc-article.component';
import { DocTreeComponent } from '@app/shared/docs/doc-tree.component';
import { type ApiEntry, type DocPage, DocsService, type SearchHit } from '@app/shared/docs/docs.service';
import { seedNewGame } from '@app/shared/docs/seed-new-game';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import {
  ButtonDirective,
  ConfirmDialogComponent,
  type ConfirmDialogData,
  DialogService,
  HighlightComponent,
  IconComponent,
  SearchComponent,
  ToastService,
} from '@naucto/ui';

import { EditorRuntimeService } from '../state/editor-runtime.service';
import { DocRequestService } from './doc-request.service';

/** The editor's DOC tab: the reference beside the code — search, tree, a page or a function card. */
@Component({
  selector: 'nc-doc-pane',
  imports: [
    TranslocoDirective,
    ButtonDirective,
    IconComponent,
    SearchComponent,
    ApiCardComponent,
    DocArticleComponent,
    DocTreeComponent,
    HighlightComponent,
  ],
  template: `
    <div *transloco="let t" class="relative flex h-full flex-col">
      <!-- The head of every column on this side of the editor is one height; this one was 32. -->
      <div class="flex h-(--nc-bar-h) shrink-0 items-center gap-1 border-b border-line px-1.5">
        @if (view() !== 'tree') {
          <button ncButton variant="ghost" size="sm" iconOnly [attr.aria-label]="t('docs.back')" (click)="back()">
            <nc-icon name="chevron-left" [size]="24" />
          </button>
        }
        <nc-icon name="reference" [size]="24" class="text-ink" />
        @if (view() === 'page' && page(); as p) {
          <button type="button" class="label text-ink-3 hover:text-ink" (click)="home()">
            {{ t('docs.reference') }}
          </button>
          <span class="label text-ink-4">›</span>
          <span class="label min-w-0 truncate text-ink">{{ p.title }}</span>
        } @else {
          <span class="label text-ink">{{ t('docs.reference') }}</span>
          <span class="flex-1"></span>
          <span class="label text-ink-4">F1</span>
        }
      </div>
      <nc-search #search class="m-1.5" [placeholder]="t('docs.search')" hint="" [value]="query()" (valueChange)="query.set($event)" />
      <div class="min-h-0 flex-1 overflow-auto px-1.5 pb-1.5">
        @if (hits().length) {
          <div role="listbox">
            @for (h of hits(); track h.slug + h.title) {
              <button type="button" role="option"
                aria-selected="false" class="block w-full border-b border-line py-1 text-left hover:text-ink" (click)="openHit(h)">
                <div class="truncate text-meta" [class]="h.kind === 'api' ? 'font-mono text-gold-ink' : 'text-ink'"><nc-highlight [text]="h.title" [match]="query()" /></div>
                <div class="truncate text-label text-ink-4">{{ h.subtitle }}</div>
              </button>
            }
          </div>
        } @else if (view() === 'api' && entry(); as e) {
          <nc-api-card [entry]="e" [insertable]="true" (insert)="insert($event)" (navigate)="openApi($event)" />
        } @else if (view() === 'page' && page(); as p) {
          @if (p.lua) {
            <button ncButton variant="primary" size="sm" class="mb-1.5" (click)="copyToNewGame(p)">
              <nc-icon name="file-plus" [size]="12" />
              {{ t('docs.copyToNewGame') }}
            </button>
          }
          <nc-doc-article [page]="p" [insertable]="true" (insert)="insert($event)" (navigate)="navigate($event)" />
          @if (neighbours(); as n) {
            <nav class="mt-3 flex justify-between gap-1 border-t border-line pt-1.5">
              @if (n.prev; as prev) {
                <button ncButton variant="secondary" size="sm" (click)="openPage(prev.slug)">
                  <nc-icon name="chevron-left" [size]="12" />
                  {{ prev.title }}
                </button>
              } @else {
                <span></span>
              }
              @if (n.next; as next) {
                <button ncButton variant="secondary" size="sm" (click)="openPage(next.slug)">
                  {{ next.title }}
                  <nc-icon name="chevron-right" [size]="12" />
                </button>
              }
            </nav>
          }
        } @else if (docs.error()) {
          <p class="p-2 text-body text-ink-3">{{ t('docs.unavailableHint') }}</p>
        } @else {
          <nc-doc-tree [active]="slug()" [fragment]="fragment()" (open)="openPage($event)" />
          <p class="label mt-2 text-ink-4">{{ t('docs.tutorialHint') }}</p>
        }
      </div>
    </div>
  `,
  host: { class: 'block h-full' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocPaneComponent {
  protected readonly docs = inject(DocsService);
  private readonly requests = inject(DocRequestService);
  private readonly search = viewChild<SearchComponent>('search');
  private readonly runtime = inject(EditorRuntimeService);
  private readonly toasts = inject(ToastService);
  private readonly dialogs = inject(DialogService);
  private readonly i18n = inject(TranslocoService);
  private readonly router = inject(Router);
  protected readonly query = signal('');
  protected readonly slug = signal<string | null>(null);
  protected readonly fragment = signal<string | null>(null);
  protected readonly apiName = signal<string | null>(null);
  protected readonly view = computed<'tree' | 'page' | 'api'>(() => (this.apiName() ? 'api' : this.slug() ? 'page' : 'tree'));
  protected readonly page = computed(() => (this.slug() ? this.docs.page(this.slug() ?? '') : null));
  protected readonly neighbours = computed(() => this.docs.neighbours(this.slug() ?? ''));
  protected readonly entry = computed<ApiEntry | null>(() => (this.apiName() ? this.docs.lookup(this.apiName() ?? '') : null));
  protected readonly hits = computed<SearchHit[]>(() => this.docs.search(this.query(), 10));

  constructor() {
    void this.docs.load();
    // F1 and symbol hovers in the code editor reach the pane through the request service; nothing
    // else knows which pane is mounted (the console tab, or the split column).
    effect(() => {
      const req = this.requests.requested();
      untracked(() => {
        if (req.name) this.show(req.name);
      });
    });
    effect(() => {
      this.requests.searchFocus();
      untracked(() => {
        this.search()?.focus();
      });
    });
  }

  /** Show a function card (from the code editor's hover / F1). */
  show(name: string): void {
    this.query.set('');
    this.apiName.set(name);
  }

  protected back(): void {
    if (this.apiName()) this.apiName.set(null);
    else this.slug.set(null);
  }

  protected home(): void {
    this.apiName.set(null);
    this.slug.set(null);
  }

  /** The pane sits in a game being edited: the copy is another game, so the editor is left. */
  protected copyToNewGame(p: DocPage): void {
    this.dialogs
      .open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, {
        data: {
          title: this.i18n.translate('docs.copyFromEditorTitle'),
          message: this.i18n.translate('docs.copyFromEditorMessage'),
          confirmLabel: this.i18n.translate('docs.copyFromEditorConfirm'),
        },
      })
      .closed.subscribe((ok) => {
        if (ok !== true) return;
        seedNewGame(p);
        void this.router.navigate(['/games/new']);
      });
  }

  /** A page, or a place on one (`slug#anchor`), scrolled to once it is in the pane. */
  protected openPage(target: string): void {
    const [slug = '', fragment = null] = target.split('#');
    this.apiName.set(null);
    this.slug.set(slug);
    this.fragment.set(fragment);
    if (fragment)
      setTimeout(() => document.getElementById(fragment)?.scrollIntoView({ block: 'start' }), 50);
  }

  protected openApi(name: string): void {
    const e = this.docs.lookup(name);
    if (e) this.show(e.name);
  }

  protected openHit(h: SearchHit): void {
    this.query.set('');
    if (h.api) this.show(h.api.name);
    else this.openPage(h.fragment ? `${h.slug}#${h.fragment}` : h.slug);
  }

  protected navigate(target: string): void {
    if (target.startsWith('/learn/')) this.openPage(target.slice('/learn/'.length));
    else this.openApi(target);
  }

  /** Insert at the caret if the code tab is open; otherwise copy the call. */
  protected insert(e: ApiEntry): void {
    const snippet = e.signature.includes('()') ? `${e.name}()` : `${e.name}(`;
    const inserted = this.runtime.insertAtCursor?.(snippet) ?? false;
    if (!inserted) {
      void navigator.clipboard.writeText(snippet);
      this.toasts.show('Copied', 'success');
    }
  }
}
