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
import { ApiCardComponent } from '@app/shared/docs/api-card.component';
import { DocArticleComponent } from '@app/shared/docs/doc-article.component';
import { DocTreeComponent } from '@app/shared/docs/doc-tree.component';
import { type ApiEntry, DocsService, type SearchHit } from '@app/shared/docs/docs.service';
import { TranslocoDirective } from '@jsverse/transloco';
import { ButtonDirective, IconComponent, SearchComponent, ToastService } from '@naucto/ui';

import { EditorRuntimeService } from '../state/editor-runtime.service';
import { EditorUiStore } from '../state/editor-ui.store';
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
  ],
  template: `
    <div *transloco="let t" class="relative flex h-full flex-col">
      <!-- The artboard hangs the control on the pane's own edge: a chevron when the reference sits
           beside the console, and a swap glyph when it has taken the console's place. Either way
           the one button puts it away — F1 and Ctrl-K bring it back. -->
      <button
        type="button"
        class="absolute top-1/2 -left-1 z-20 flex h-[52px] w-2 -translate-y-1/2 items-center justify-center rounded-[8px] border border-line-strong bg-raised text-ink-2 hover:text-ink"
        [attr.aria-label]="ui.columnMode() === 'swap' ? t('docs.swapBack') : t('docs.close')"
        (click)="ui.setReferenceOpen(false)"
      >
        <nc-icon [name]="ui.columnMode() === 'swap' ? 'sync' : 'chevron-right'" [size]="12" />
      </button>
      <div class="flex h-4 items-center gap-1 border-b border-line px-1.5">
        @if (view() !== 'tree') {
          <button ncButton variant="ghost" size="sm" iconOnly [attr.aria-label]="t('docs.back')" (click)="back()">
            <nc-icon name="chevron-left" [size]="12" />
          </button>
        }
        <nc-icon name="reference" [size]="12" class="text-ink" />
        <span class="label text-ink">{{ t('docs.reference') }}</span>
        <span class="flex-1"></span>
        <span class="label text-ink-4">F1</span>
      </div>
      <nc-search #search class="m-1.5" [placeholder]="t('docs.search')" hint="" [value]="query()" (valueChange)="query.set($event)" />
      <div class="min-h-0 flex-1 overflow-auto px-1.5 pb-1.5">
        @if (hits().length) {
          <div role="listbox">
            @for (h of hits(); track h.slug + h.title) {
              <button type="button" role="option"
                aria-selected="false" class="block w-full border-b border-line py-1 text-left hover:text-ink" (click)="openHit(h)">
                <div class="truncate text-meta" [class]="h.kind === 'api' ? 'font-mono text-gold-ink' : 'text-ink'">{{ h.title }}</div>
                <div class="truncate text-label text-ink-4">{{ h.subtitle }}</div>
              </button>
            }
          </div>
        } @else if (view() === 'api' && entry(); as e) {
          <div class="label mb-1 text-ink-4">API › {{ e.name.split('.')[0] }} › {{ e.name.split('.')[1] }}</div>
          <nc-api-card [entry]="e" [insertable]="true" (insert)="insert($event)" (navigate)="openApi($event)" />
        } @else if (view() === 'page' && page(); as p) {
          <nc-doc-article [page]="p" [insertable]="true" (insert)="insert($event)" (navigate)="navigate($event)" />
        } @else if (docs.error()) {
          <p class="p-2 text-body text-ink-3">{{ t('docs.unavailableHint') }}</p>
        } @else {
          <nc-doc-tree [active]="slug()" (open)="openPage($event)" />
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
  protected readonly ui = inject(EditorUiStore);
  private readonly toasts = inject(ToastService);
  protected readonly query = signal('');
  protected readonly slug = signal<string | null>(null);
  protected readonly apiName = signal<string | null>(null);
  protected readonly view = computed<'tree' | 'page' | 'api'>(() => (this.apiName() ? 'api' : this.slug() ? 'page' : 'tree'));
  protected readonly page = computed(() => (this.slug() ? this.docs.page(this.slug() ?? '') : null));
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

  protected openPage(slug: string): void {
    this.apiName.set(null);
    this.slug.set(slug);
  }

  protected openApi(name: string): void {
    const e = this.docs.lookup(name);
    if (e) this.show(e.name);
  }

  protected openHit(h: SearchHit): void {
    this.query.set('');
    if (h.api) this.show(h.api.name);
    else this.openPage(h.slug);
  }

  protected navigate(target: string): void {
    if (target.startsWith('/learn/')) this.openPage(target.slice('/learn/'.length).split('#')[0] ?? '');
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
