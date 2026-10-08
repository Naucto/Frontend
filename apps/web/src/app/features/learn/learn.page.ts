import { Location } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  linkedSignal,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import {
  ButtonDirective,
  EmptyStateComponent,
  HighlightComponent,
  IconComponent,
  SearchComponent,
  shortcutLabel,
} from '@naucto/ui';

import { AuthStore } from '../../core/auth/auth.store';
import { DocAnchorComponent } from '../../shared/docs/doc-anchor.component';
import { DocArticleComponent } from '../../shared/docs/doc-article.component';
import { DocTreeComponent } from '../../shared/docs/doc-tree.component';
import {
  type ApiEntry,
  type DocPage,
  DocsService,
  type SearchHit,
} from '../../shared/docs/docs.service';
import { seedNewGame } from '../../shared/docs/seed-new-game';

/** /learn: the documentation, rendered in the app with the tree, search and "copy to new game". */
@Component({
  selector: 'nc-learn-page',
  imports: [
    TranslocoDirective,
    ButtonDirective,
    EmptyStateComponent,
    IconComponent,
    SearchComponent,
    DocAnchorComponent,
    DocArticleComponent,
    DocTreeComponent,
    HighlightComponent,
  ],
  templateUrl: './learn.page.html',
  host: {
    '(document:keydown.escape)': 'query.set("")',
    '(document:keydown)': 'onKey($event)',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class LearnPage {
  /** Doc slug: "api/gfx", "tutorials/pong" … (empty = index). */
  readonly path = input<string | undefined>();
  protected readonly searchHint = shortcutLabel('K');
  private readonly searchBox = viewChild<SearchComponent>('search');
  protected readonly articleEl = viewChild<string, ElementRef<HTMLElement>>('article', {
    read: ElementRef,
  });
  private readonly anchor = viewChild(DocAnchorComponent);
  protected readonly docs = inject(DocsService);
  protected readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  /** The route's fragment, which the step bar moves ahead of the router. */
  protected readonly fragment = linkedSignal(
    toSignal(inject(ActivatedRoute).fragment, { initialValue: null }),
  );
  protected readonly query = signal('');
  protected readonly slug = computed(
    () => (this.path() ?? '').replace(/^\/+|\/+$/g, '') || 'index',
  );
  protected readonly page = computed<DocPage | null>(() => this.docs.page(this.slug()));
  protected readonly neighbours = computed(() => this.docs.neighbours(this.slug()));
  protected readonly hits = computed<SearchHit[]>(() => this.docs.search(this.query()));

  constructor() {
    void this.docs.load();
    effect(() => {
      if (!this.page()) {
        return;
      }
      untracked(() => {
        const hash = window.location.hash.slice(1);
        if (hash) {
          this.reveal(hash);
        }
      });
    });
  }

  /** Once the page is in the document, which a navigation to the same page does not wait for. */
  private reveal(id: string): void {
    setTimeout(() => this.anchor()?.reveal(id), 50);
  }

  /** A page, or a place on one: `api/gfx#gfx.clear`, `tutorials/pong#the-ball`. */
  protected go(target: string): void {
    this.query.set('');
    const [slug = '', fragment] = target.split('#');
    void this.router
      .navigate(['/learn', ...slug.split('/')], fragment ? { fragment } : undefined)
      .then(() => {
        if (fragment) {
          this.reveal(fragment);
        }
      });
  }

  protected openHit(hit: SearchHit): void {
    const fragment = hit.fragment ?? hit.api?.name;
    this.go(fragment ? `${hit.slug}#${fragment}` : hit.slug);
  }

  /** Links from rendered pages: "/learn/x#y" paths or "gfx.clear" api refs. */
  protected navigate(target: string): void {
    if (target.startsWith('/learn/')) {
      this.go(target.slice('/learn/'.length));
      return;
    }
    if (target.startsWith('/')) {
      void this.router.navigateByUrl(target);
      return;
    }
    const entry: ApiEntry | null = this.docs.lookup(target);
    if (entry) {
      this.go(`${this.docs.apiSlug(entry)}#${entry.name}`);
    }
  }

  /**
   * The step bar moved the reader; the URL and the tree follow. Not a router navigation: the
   * router scrolls every one of those back to the top of the page.
   */
  protected anchorTo(fragment: string): void {
    this.fragment.set(fragment);
    this.location.replaceState(`${this.location.path()}#${fragment}`);
  }

  /** Tutorials open as a fresh game with their main.lua already in place. */
  protected copyToNewGame(page: DocPage): void {
    seedNewGame(page);
    void this.router.navigate(['/games/new']);
  }

  /** Ctrl/⌘-K rather than "/", which the top bar's search owns on every page. */
  protected onKey(event: KeyboardEvent): void {
    if (event.key !== 'k' || !(event.ctrlKey || event.metaKey) || event.altKey) {
      return;
    }
    event.preventDefault();
    this.searchBox()?.focus();
  }
}
