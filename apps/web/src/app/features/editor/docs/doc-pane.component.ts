import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { ApiCardComponent } from '@app/shared/docs/api-card.component';
import { DocAnchorComponent } from '@app/shared/docs/doc-anchor.component';
import { DocArticleComponent } from '@app/shared/docs/doc-article.component';
import { DocTreeComponent } from '@app/shared/docs/doc-tree.component';
import {
  type ApiEntry,
  type DocPage,
  DocsService,
  type SearchHit,
} from '@app/shared/docs/docs.service';
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

/** The editor's reference pane: search, the tree, a page or a function card. */
@Component({
  selector: 'nc-doc-pane',
  imports: [
    TranslocoDirective,
    ButtonDirective,
    IconComponent,
    SearchComponent,
    ApiCardComponent,
    DocAnchorComponent,
    DocArticleComponent,
    DocTreeComponent,
    HighlightComponent,
  ],
  templateUrl: './doc-pane.component.html',
  host: { class: 'block h-full' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocPaneComponent {
  protected readonly docs = inject(DocsService);
  private readonly requests = inject(DocRequestService);
  private readonly search = viewChild<SearchComponent>('search');
  protected readonly scrollerEl = viewChild<string, ElementRef<HTMLElement>>('scroller', {
    read: ElementRef,
  });
  protected readonly articleEl = viewChild<string, ElementRef<HTMLElement>>('article', {
    read: ElementRef,
  });
  private readonly runtime = inject(EditorRuntimeService);
  private readonly toasts = inject(ToastService);
  private readonly dialogs = inject(DialogService);
  private readonly i18n = inject(TranslocoService);
  private readonly router = inject(Router);
  protected readonly query = signal('');
  protected readonly slug = signal<string | null>(null);
  protected readonly fragment = signal<string | null>(null);
  protected readonly apiName = signal<string | null>(null);
  protected readonly view = computed<'tree' | 'page' | 'api'>(() =>
    this.apiName() ? 'api' : this.slug() ? 'page' : 'tree',
  );
  protected readonly page = computed(() =>
    this.slug() ? this.docs.page(this.slug() ?? '') : null,
  );
  protected readonly neighbours = computed(() => this.docs.neighbours(this.slug() ?? ''));
  protected readonly entry = computed<ApiEntry | null>(() =>
    this.apiName() ? this.docs.lookup(this.apiName() ?? '') : null,
  );
  protected readonly hits = computed<SearchHit[]>(() => this.docs.search(this.query(), 10));

  constructor() {
    void this.docs.load();
    // A request can precede the pane, which is built only while the reference is open, so it is
    // read from the request service.
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

  private show(name: string): void {
    this.query.set('');
    this.apiName.set(name);
  }

  protected back(): void {
    if (this.apiName()) this.apiName.set(null);
    else this.slug.set(null);
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
