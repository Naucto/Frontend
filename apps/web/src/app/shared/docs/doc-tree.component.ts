import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { readJson, STORAGE_KEYS, writeJson } from '@app/core/storage/local-storage';
import { TranslocoDirective } from '@jsverse/transloco';
import { IconComponent, type IconName } from '@naucto/ui';

import { type DocPage, DocsService } from './docs.service';

/**
 * The documentation tree: sections → pages, and under the page being read, what is on it.
 *
 * Only the open page unfolds — every page's sections at once is a table of contents of the whole
 * site, and a tree nobody can scan. A page of cards lists its functions, a page of prose its
 * sections; both are one click from the place itself.
 */
@Component({
  selector: 'nc-doc-tree',
  imports: [TranslocoDirective, IconComponent],
  template: `
    <nav *transloco="let t" [attr.aria-label]="t('docs.title')" class="font-mono text-meta">
      @for (s of docs.sections(); track s.id) {
        <button
          type="button"
          class="label flex w-full items-center gap-0.5 py-1 text-left text-ink-3 hover:text-ink"
          [attr.aria-expanded]="!collapsed().has(s.id)"
          (click)="toggle(s.id)"
        >
          <nc-icon [name]="collapsed().has(s.id) ? 'chevron-right' : 'chevron-down'" [size]="12" />
          <nc-icon [name]="iconOf(s.id)" [size]="12" class="text-ink-4" />
          {{ t('docs.sections.' + s.id) }}
        </button>
        @if (!collapsed().has(s.id)) {
          @for (p of s.pages; track p.slug) {
            @if (!p.slug.endsWith('/index')) {
              <button
                type="button"
                class="flex w-full items-center gap-1 border-l-2 py-0.5 pl-2 text-left hover:text-ink"
                [class]="p.slug === active() ? 'border-gold text-gold-ink' : 'border-transparent text-ink-2'"
                [attr.aria-current]="p.slug === active() ? 'page' : null"
                (click)="open.emit(p.slug)"
              >
                <span class="min-w-0 flex-1 truncate">{{ p.title }}</span>
                @if (p.apis.length) {
                  <span class="label text-ink-4">{{ p.apis.length }} fn</span>
                }
              </button>
              @if (p.slug === active()) {
                @for (c of childrenOf(p); track c.id) {
                  <button
                    type="button"
                    class="flex w-full items-center border-l-2 py-0.5 text-left text-label hover:text-ink"
                    [class]="
                      (c.id === fragment() ? 'border-gold text-gold-ink' : 'border-transparent text-ink-3') +
                      (c.sub ? ' pl-5' : ' pl-3')
                    "
                    [attr.aria-current]="c.id === fragment() ? 'location' : null"
                    (click)="open.emit(p.slug + '#' + c.id)"
                  >
                    <span class="min-w-0 flex-1 truncate" [class.font-mono]="c.code">{{ c.text }}</span>
                  </button>
                }
              }
            }
          }
        }
      }
    </nav>
  `,
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocTreeComponent {
  readonly active = input<string | null>(null);
  /** The anchor being read on the active page, which is the child the tree marks. */
  readonly fragment = input<string | null>(null);
  /** A slug, with `#anchor` when a child of the page was chosen. */
  readonly open = output<string>();
  protected readonly docs = inject(DocsService);
  protected readonly collapsed = signal(new Set(readJson<string[]>(STORAGE_KEYS.docsCollapsed, [])));

  /**
   * What a page unfolds into: its function cards, or failing those its sections, and under the
   * section the reader is in, its sub-sections. The other sections keep theirs folded, or a long
   * tutorial would list every step of every step.
   */
  protected childrenOf(p: DocPage): { id: string; text: string; code: boolean; sub: boolean }[] {
    if (p.apis.length)
      return p.apis.map((name) => ({
        id: name,
        text: name.split('.')[1] ?? name,
        code: true,
        sub: false,
      }));
    const at = this.fragment();
    let current: string | null = null;
    for (const h of p.headings) {
      if (h.level === 2) current = h.id;
      if (h.id === at) break;
    }
    const open = p.headings.some((h) => h.id === at) ? current : null;
    const out: { id: string; text: string; code: boolean; sub: boolean }[] = [];
    let under: string | null = null;
    for (const h of p.headings) {
      if (h.level === 2) {
        under = h.id;
        out.push({ id: h.id, text: h.text, code: false, sub: false });
      } else if (h.level === 3 && under === open) {
        out.push({ id: h.id, text: h.text, code: false, sub: true });
      }
    }
    return out;
  }

  /** Each section header takes the glyph the artboard draws on it. */
  protected iconOf(section: string): IconName {
    if (section === 'start') return 'zap';
    if (section === 'concepts') return 'grid';
    if (section === 'tutorials') return 'play';
    if (section === 'api') return 'code';
    if (section === 'editors') return 'sliders';
    return 'lightbulb';
  }

  protected toggle(id: string): void {
    this.collapsed.update((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      writeJson(STORAGE_KEYS.docsCollapsed, [...next]);
      return next;
    });
  }
}
