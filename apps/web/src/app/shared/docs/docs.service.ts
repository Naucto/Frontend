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
  legacySlugs: string[];
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
  examples: { code: string; html: string }[];
  notes: { kind: string; html: string }[];
  aliases: string[];
  since: string;
  seeAlso: string[];
  aliasOf?: string;
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

export const SECTION_ORDER: DocPage['section'][] = [
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

  readonly index = this.indexSig.asReadonly();
  readonly ready = computed(() => this.indexSig() !== null);
  readonly error = this.failed.asReadonly();
  readonly pages = computed(() => this.indexSig()?.pages ?? []);
  readonly namespaces = computed(() => this.indexSig()?.manifest.namespaces ?? []);
  readonly sections = computed<DocsSection[]>(() =>
    SECTION_ORDER.map((id) => ({ id, pages: this.pages().filter((p) => p.section === id) })).filter(
      (s) => s.pages.length,
    ),
  );

  load(): Promise<void> {
    this.loading ??= fetch('/docs/index.json', { cache: 'no-cache' })
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        this.indexSig.set((await r.json()) as DocsIndex);
      })
      .catch(() => {
        this.failed.set(true);
      });
    return this.loading;
  }

  page(slug: string): DocPage | null {
    return this.pages().find((p) => p.slug === slug) ?? null;
  }

  /** Resolve `gfx.clear` or a legacy name like `clear`; aliases resolve to their target. */
  lookup(name: string): ApiEntry | null {
    const idx = this.indexSig()?.manifest.index;
    if (!idx) return null;
    const e = idx[name];
    if (!e) return null;
    return e.aliasOf ? (idx[e.aliasOf] ?? e) : e;
  }

  neighbours(slug: string): { prev: DocPage | null; next: DocPage | null } {
    const page = this.page(slug);
    if (!page) return { prev: null, next: null };
    const pages = this.sections().find((s) => s.id === page.section)?.pages ?? [];
    const i = pages.findIndex((p) => p.slug === page.slug);
    return { prev: pages[i - 1] ?? null, next: pages[i + 1] ?? null };
  }

  /** Every function name in a namespace, in manifest order. */
  peers(namespace: string): readonly string[] {
    return (
      this.namespaces()
        .find((n) => n.namespace === namespace)
        ?.functions.map((f) => f.name) ?? []
    );
  }

  search(query: string, limit = 12): SearchHit[] {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const hits: SearchHit[] = [];
    for (const ns of this.namespaces())
      for (const e of [...ns.functions, ...ns.values]) {
        const short = e.name.split('.')[1] ?? e.name;
        const score =
          short === q || e.name === q ? 95
          : e.name.includes(q) ? 85
          : e.aliases.some((a) => a.includes(q)) ? 75
          : e.summary.toLowerCase().includes(q) ? 60
          : 0;
        if (score)
          hits.push({
            kind: 'api',
            title: e.signature || e.name,
            subtitle: e.summary,
            slug: `api/${ns.namespace}`,
            score,
            api: e,
          });
      }
    for (const p of this.pages()) {
      const title = p.title.toLowerCase();
      let best: SearchHit | null = null;
      const offer = (hit: SearchHit): void => {
        if (!best || hit.score > best.score) best = hit;
      };
      if (title.includes(q))
        offer({
          kind: 'page',
          title: p.title,
          subtitle: p.description || snippet(p.text, q),
          slug: p.slug,
          score: title === q ? 100 : title.startsWith(q) ? 90 : 80,
        });
      for (const s of p.sections) {
        const inTitle = s.title.toLowerCase().includes(q);
        if (!inTitle && !s.text.toLowerCase().includes(q)) continue;
        offer({
          kind: 'page',
          title: p.title,
          subtitle: `${s.title} · ${inTitle ? s.text.slice(0, 90) : snippet(s.text, q)}`,
          slug: p.slug,
          fragment: s.id,
          score: inTitle ? 70 : 40,
        });
      }
      if (!best && p.text.toLowerCase().includes(q))
        offer({ kind: 'page', title: p.title, subtitle: snippet(p.text, q), slug: p.slug, score: 30 });
      if (best) hits.push(best);
    }
    return hits.sort((a, b) => b.score - a.score).slice(0, limit);
  }
}

function snippet(text: string, q: string): string {
  const i = text.toLowerCase().indexOf(q);
  if (i < 0) return text.slice(0, 90);
  const start = Math.max(0, i - 40);
  return (start ? '…' : '') + text.slice(start, start + 110) + '…';
}
