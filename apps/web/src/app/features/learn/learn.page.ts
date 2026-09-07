import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { AuthStore } from '@app/core/auth/auth.store';
import { DocArticleComponent } from '@app/shared/docs/doc-article.component';
import { DocTreeComponent } from '@app/shared/docs/doc-tree.component';
import {
  type ApiEntry,
  type DocPage,
  DocsService,
  type SearchHit,
} from '@app/shared/docs/docs.service';
import { TranslocoDirective } from '@jsverse/transloco';
import { ButtonDirective, EmptyStateComponent, IconComponent, SearchComponent } from '@naucto/ui';

/** /learn: the documentation, rendered in the app with the tree, search and "copy to new game". */
@Component({
  selector: 'nc-learn-page',
  imports: [
    TranslocoDirective,
    ButtonDirective,
    EmptyStateComponent,
    IconComponent,
    SearchComponent,
    DocArticleComponent,
    DocTreeComponent,
  ],
  template: `
    <div *transloco="let t" class="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)_200px]">
      <aside class="lg:sticky lg:top-8 lg:self-start">
        <nc-search
          #search
          class="mb-2"
          [placeholder]="t('docs.search')"
          hint="⌘K"
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
                  {{ h.title }}
                </div>
                <div class="truncate text-label text-ink-4">{{ h.subtitle }}</div>
              </button>
            }
          </div>
        }
        <nc-doc-tree [active]="slug()" (open)="go($event)" />
      </aside>

      <!-- A measure. The column had none, so on a wide screen 12px body text ran the full width
           of 1fr — around 105 characters a line, well past what anyone reads comfortably. There is
           no artboard for /learn, so this is the typographic figure rather than a measured one. -->
      <article class="min-w-0 max-w-[760px]">
        @if (page(); as p) {
          <div class="mb-2 flex items-center gap-2">
            <span class="label text-ink-4">{{ t('docs.sections.' + p.section) }}</span>
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
          <nc-doc-article [page]="p" (navigate)="navigate($event)" />
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

      <aside class="hidden lg:sticky lg:top-8 lg:block lg:self-start">
        @if (page()?.headings?.length) {
          <div class="label mb-1 text-ink-4">{{ t('docs.onThisPage') }}</div>
          @for (h of page()?.headings ?? []; track h.id) {
            <a
              [href]="'#' + h.id"
              class="block truncate py-0.5 text-meta text-ink-3 hover:text-ink"
              [class.pl-2]="h.level === 3"
              (click)="jump($event, h.id)"
            >
              {{ h.text }}
            </a>
          }
        }
      </aside>
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
  private readonly searchBox = viewChild<SearchComponent>('search');
  protected readonly docs = inject(DocsService);
  protected readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  protected readonly query = signal('');
  protected readonly slug = computed(
    () => (this.path() ?? '').replace(/^\/+|\/+$/g, '') || 'index',
  );
  protected readonly page = computed<DocPage | null>(() => this.docs.page(this.slug()));
  protected readonly hits = computed<SearchHit[]>(() => this.docs.search(this.query()));

  constructor() {
    void this.docs.load();
    effect(() => {
      const p = this.page();
      if (!p) return;
      untracked(() => {
        const hash = location.hash.slice(1);
        if (hash)
          setTimeout(() => document.getElementById(hash)?.scrollIntoView({ block: 'start' }), 50);
      });
    });
  }

  protected go(slug: string): void {
    this.query.set('');
    void this.router.navigate(['/learn', ...slug.split('/')]);
  }

  protected openHit(h: SearchHit): void {
    this.query.set('');
    void this.router.navigate(['/learn', ...h.slug.split('/')], { fragment: h.api?.name });
  }

  /** Links from rendered pages: "/learn/x#y" paths or "gfx.clear" api refs. */
  protected navigate(target: string): void {
    if (target.startsWith('/')) {
      const [path, fragment] = target.split('#');
      void this.router.navigateByUrl(path ?? target).then(() => {
        if (fragment)
          setTimeout(
            () => document.getElementById(fragment)?.scrollIntoView({ block: 'start' }),
            50,
          );
      });
      return;
    }
    const entry: ApiEntry | null = this.docs.lookup(target);
    if (entry)
      void this.router.navigate(['/learn', 'api', entry.name.split('.')[0]], {
        fragment: entry.name,
      });
  }

  protected jump(e: Event, id: string): void {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  /** Tutorials open as a fresh game with their main.lua already in place. */
  protected copyToNewGame(p: DocPage): void {
    if (!p.lua) return;
    sessionStorage.setItem('naucto.seed-code', p.lua);
    sessionStorage.setItem('naucto.seed-name', p.title.replace(/^Build /, ''));
    void this.router.navigate(['/games/new']);
  }

  protected onKey(e: KeyboardEvent): void {
    if (e.key !== 'k' || !(e.ctrlKey || e.metaKey) || e.altKey) return;
    e.preventDefault();
    this.searchBox()?.focus();
  }
}
