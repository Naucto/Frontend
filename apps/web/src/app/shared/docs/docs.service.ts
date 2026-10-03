import { computed, Injectable, signal } from '@angular/core';
import type { TutorialAssets } from '@naucto/engine';

export interface DocHeading {
  level: number;
  id: string;
  text: string;
}

export interface DocPage {
  slug: string;
  title: string;
  section: 'start' | 'concepts' | 'tutorials' | 'api' | 'editors' | 'reference';
  order: number;
  description: string;
  namespace: string | null;
  lua: string | null;
  /** What a tutorial's game holds besides its code; null on other pages. */
  assets: TutorialAssets | null;
  /** The functions the page shows cards for, in page order; empty on a page of prose. */
  apis: string[];
  headings: DocHeading[];
  sections: { id: string; title: string; text: string }[];
  html: string;
  text: string;
}

export interface ApiParam {
  name: string;
  type: string;
  description: string;
  descriptionHtml: string;
  optional?: boolean;
  /** What a left-out optional parameter stands for. */
  default?: string;
}

export interface ApiEntry {
  name: string;
  kind: 'function' | 'value';
  signature: string;
  summary: string;
  descriptionHtml: string;
  /** A figure of what the call draws, or nothing where there is nothing to see. */
  pictureHtml: string;
  params: ApiParam[];
  returns: string | null;
  /** What a function returns, as a type name or a union like `number|nil`; null where `returns` is. */
  returnType: string | null;
  examples: { code: string; html: string }[];
  notes: { kind: string; html: string }[];
  since: string;
  seeAlso: string[];
}

export interface ApiNamespace {
  namespace: string;
  title: string;
  functions: ApiEntry[];
  values: ApiEntry[];
}

export interface DocsIndex {
  pages: DocPage[];
  manifest: { namespaces: ApiNamespace[]; index: Record<string, ApiEntry> };
}

export interface DocsSection {
  id: DocPage['section'];
  pages: DocPage[];
}

export interface SearchHit {
  kind: 'page' | 'api';
  title: string;
  subtitle: string;
  slug: string;
  fragment?: string;
  score: number;
  api?: ApiEntry;
}

const SECTION_ORDER: DocPage['section'][] = [
  'start',
  'concepts',
  'tutorials',
  'api',
  'editors',
  'reference',
];

/** The built documentation (docs submodule → /docs/index.json), loaded once on first use. */
@Injectable({ providedIn: 'root' })
export class DocsService {
  private readonly indexSig = signal<DocsIndex | null>(null);
  private readonly failed = signal(false);
  private loading: Promise<void> | null = null;

  readonly ready = computed(() => this.indexSig() !== null);
  readonly error = this.failed.asReadonly();
  readonly pages = computed(() => this.indexSig()?.pages ?? []);
  readonly namespaces = computed(() => this.indexSig()?.manifest.namespaces ?? []);
  readonly sections = computed<DocsSection[]>(() =>
    SECTION_ORDER.map((id) => ({
      id,
      pages: this.pages().filter((docPage) => docPage.section === id),
    })).filter((section) => section.pages.length),
  );

  load(): Promise<void> {
    this.loading ??= fetch('/docs/index.json', { cache: 'no-cache' })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(String(response.status));
        }
        this.indexSig.set((await response.json()) as DocsIndex);
      })
      .catch(() => {
        this.failed.set(true);
      });
    return this.loading;
  }

  page(slug: string): DocPage | null {
    return this.pages().find((docPage) => docPage.slug === slug) ?? null;
  }

  /** The entry named `gfx.clear`, or `pairs` for a base function. */
  lookup(name: string): ApiEntry | null {
    return this.indexSig()?.manifest.index[name] ?? null;
  }

  neighbours(slug: string): { prev: DocPage | null; next: DocPage | null } {
    const page = this.page(slug);
    if (!page) {
      return { prev: null, next: null };
    }
    const pages = this.sections().find((section) => section.id === page.section)?.pages ?? [];
    const i = pages.findIndex((item) => item.slug === page.slug);
    return { prev: pages[i - 1] ?? null, next: pages[i + 1] ?? null };
  }

  /**
   * The page a namespace is documented on, found by the namespace the page declares rather than
   * by its slug: Lua's base library is documented on `api/lua`, not on a page named after it.
   */
  private namespaceSlug(namespace: string): string {
    return (
      this.pages().find((docPage) => docPage.section === 'api' && docPage.namespace === namespace)
        ?.slug ?? `api/${namespace}`
    );
  }

  /**
   * The page an entry is documented on. Its namespace is the one that lists it, not the head of its
   * name: a base function such as `pairs` has no head at all.
   */
  apiSlug(entry: ApiEntry): string {
    const owner = this.namespaces().find((ns) =>
      [...ns.functions, ...ns.values].some((item) => item.name === entry.name),
    );
    return this.namespaceSlug(owner?.namespace ?? entry.name.split('.')[0] ?? entry.name);
  }

  /** Every function name in a namespace, in manifest order. */
  peers(namespace: string): readonly string[] {
    return (
      this.namespaces()
        .find((ns) => ns.namespace === namespace)
        ?.functions.map((func) => func.name) ?? []
    );
  }

  search(query: string, limit = 12): SearchHit[] {
    const term = query.trim().toLowerCase();
    if (!term) {
      return [];
    }
    const hits: SearchHit[] = [];
    for (const ns of this.namespaces()) {
      for (const entry of [...ns.functions, ...ns.values]) {
        const short = entry.name.split('.')[1] ?? entry.name;
        const score =
          short === term || entry.name === term
            ? 95
            : entry.name.includes(term)
              ? 85
              : entry.summary.toLowerCase().includes(term)
                ? 60
                : 0;
        if (score) {
          hits.push({
            kind: 'api',
            title: entry.signature || entry.name,
            subtitle: entry.summary,
            slug: this.namespaceSlug(ns.namespace),
            score,
            api: entry,
          });
        }
      }
    }
    for (const docPage of this.pages()) {
      const title = docPage.title.toLowerCase();
      let best: SearchHit | null = null;
      const offer = (hit: SearchHit): void => {
        if (!best || hit.score > best.score) {
          best = hit;
        }
      };
      if (title.includes(term)) {
        offer({
          kind: 'page',
          title: docPage.title,
          subtitle: docPage.description || snippet(docPage.text, term),
          slug: docPage.slug,
          score: title === term ? 100 : title.startsWith(term) ? 90 : 80,
        });
      }
      for (const section of docPage.sections) {
        const inTitle = section.title.toLowerCase().includes(term);
        if (!inTitle && !section.text.toLowerCase().includes(term)) {
          continue;
        }
        offer({
          kind: 'page',
          title: docPage.title,
          subtitle: `${section.title} · ${inTitle ? section.text.slice(0, 90) : snippet(section.text, term)}`,
          slug: docPage.slug,
          fragment: section.id,
          score: inTitle ? 70 : 40,
        });
      }
      if (!best && docPage.text.toLowerCase().includes(term)) {
        offer({
          kind: 'page',
          title: docPage.title,
          subtitle: snippet(docPage.text, term),
          slug: docPage.slug,
          score: 30,
        });
      }
      if (best) {
        hits.push(best);
      }
    }
    return hits.sort((a, b) => b.score - a.score).slice(0, limit);
  }
}

function snippet(text: string, term: string): string {
  const i = text.toLowerCase().indexOf(term);
  if (i < 0) {
    return text.slice(0, 90);
  }
  const start = Math.max(0, i - 40);
  return (start ? '…' : '') + text.slice(start, start + 110) + '…';
}
