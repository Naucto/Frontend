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
import { AuthStore } from '@app/core/auth/auth.store';
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
import { TranslocoDirective } from '@jsverse/transloco';
import {
  ButtonDirective,
  EmptyStateComponent,
  HighlightComponent,
  IconComponent,
  SearchComponent,
  shortcutLabel,
} from '@naucto/ui';

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
  template: `
    <div *transloco="let t" class="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
      <!-- The top bar scrolls away with the page, so the window's edge is what the index sticks
           to, and it scrolls on its own once the tree outgrows the viewport. -->
      <aside
        class="lg:sticky lg:top-3 lg:max-h-[calc(100dvh-24px)] lg:self-start lg:overflow-x-hidden lg:overflow-y-auto lg:pr-1"
      >
        <nc-search
          #search
          class="mb-2"
          [placeholder]="t('docs.search')"
          [hint]="searchHint"
          [value]="query()"
          (valueChange)="query.set($event)"
        />
        @if (hits().length) {
          <div class="mb-2 rounded-sm border border-line bg-raised" role="listbox">
            @for (h of hits(); track h.slug + h.title) {
              <button
                type="button"
                role="option"
                aria-selected="false"
                class="block w-full border-b border-line px-1.5 py-1 text-left last:border-b-0 hover:bg-inset"
                (click)="openHit(h)"
              >
                <div
                  class="truncate text-meta"
                  [class]="h.kind === 'api' ? 'font-mono text-gold-ink' : 'text-ink'"
                >
                  <nc-highlight [text]="h.title" [match]="query()" />
                </div>
                <div class="truncate text-label text-ink-4">{{ h.subtitle }}</div>
              </button>
            }
          </div>
        }
        <nc-doc-tree [active]="slug()" [fragment]="fragment()" (open)="go($event)" />
      </aside>

      <!-- A measure. The column had none, so on a wide screen 12px body text ran the full width
           of 1fr — around 105 characters a line, well past what anyone reads comfortably. There is
           no artboard for /learn, so this is the typographic figure rather than a measured one. -->
      <article class="relative min-w-0 max-w-[760px]">
        @if (page(); as p) {
          <nc-doc-anchor
            [page]="p"
            [article]="articleEl()?.nativeElement ?? null"
            (jump)="anchorTo($event)"
          />
          <div class="mb-2 flex items-center gap-2">
            <span class="label font-ui text-ink-4">{{ t('docs.sections.' + p.section) }}</span>
            <span class="flex-1"></span>
            @if (p.lua) {
              <button
                ncButton
                variant="primary"
                size="sm"
                (click)="copyToNewGame(p)"
                [disabled]="!auth.isAuthenticated()"
              >
                <nc-icon name="file-plus" [size]="12" />
                {{ t('docs.copyToNewGame') }}
              </button>
            }
          </div>
          <nc-doc-article #article [page]="p" (navigate)="navigate($event)" />
          @if (neighbours(); as n) {
            <nav class="mt-4 flex justify-between gap-2 border-t border-line pt-2">
              @if (n.prev; as prev) {
                <button ncButton variant="secondary" size="sm" (click)="go(prev.slug)">
                  <nc-icon name="chevron-left" [size]="12" />
                  {{ prev.title }}
                </button>
              } @else {
                <span></span>
              }
              @if (n.next; as next) {
                <button ncButton variant="secondary" size="sm" (click)="go(next.slug)">
                  {{ next.title }}
                  <nc-icon name="chevron-right" [size]="12" />
                </button>
              }
            </nav>
          }
        } @else if (docs.error()) {
          <nc-empty-state
            icon="book-open"
            [title]="t('docs.unavailable')"
            [hint]="t('docs.unavailableHint')"
          />
        } @else if (docs.ready()) {
          <nc-empty-state
            icon="book-open"
            [title]="t('docs.notFound')"
            [hint]="t('docs.notFoundHint')"
          />
        }
      </article>
    </div>
  `,
  // The docs box claimed "/" while the top bar owned it, so the page showed the same shortcut
  // twice and pressing it always landed in the other one. Ctrl/⌘-K is free on this route — the
  // editor binds it, and the editor shell is not mounted here — and it is what the reference
  // panel in the editor already advertises.
  host: {
    '(document:keydown.escape)': 'query.set("")',
    '(document:keydown)': 'onKey($event)',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LearnPage {
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
      const p = this.page();
      if (!p) return;
      untracked(() => {
        const hash = window.location.hash.slice(1);
        if (hash) this.reveal(hash);
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
        if (fragment) this.reveal(fragment);
      });
  }

  protected openHit(h: SearchHit): void {
    this.query.set('');
    const fragment = h.fragment ?? h.api?.name;
    void this.router
      .navigate(['/learn', ...h.slug.split('/')], fragment ? { fragment } : undefined)
      .then(() => {
        if (fragment) this.reveal(fragment);
      });
  }

  /** Links from rendered pages: "/learn/x#y" paths or "gfx.clear" api refs. */
  protected navigate(target: string): void {
    if (target.startsWith('/')) {
      const [path, fragment] = target.split('#');
      void this.router.navigateByUrl(path ?? target).then(() => {
        if (fragment) this.reveal(fragment);
      });
      return;
    }
    const entry: ApiEntry | null = this.docs.lookup(target);
    if (entry)
      void this.router.navigate(['/learn', 'api', entry.name.split('.')[0]], {
        fragment: entry.name,
      });
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
  protected copyToNewGame(p: DocPage): void {
    seedNewGame(p);
    void this.router.navigate(['/games/new']);
  }

  protected onKey(e: KeyboardEvent): void {
    if (e.key !== 'k' || !(e.ctrlKey || e.metaKey) || e.altKey) return;
    e.preventDefault();
    this.searchBox()?.focus();
  }
}
