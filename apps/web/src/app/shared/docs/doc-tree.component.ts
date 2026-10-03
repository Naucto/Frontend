import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { IconComponent, type IconName } from '@naucto/ui';

import { readJson, STORAGE_KEYS, writeJson } from '../../core/storage/local-storage';
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
  templateUrl: './doc-tree.component.html',
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
  protected readonly collapsed = signal(
    new Set(readJson<string[]>(STORAGE_KEYS.docsCollapsed, [])),
  );

  /**
   * What a page unfolds into: its function cards, or failing those its sections, and under the
   * section the reader is in, its sub-sections. The other sections keep theirs folded, or a long
   * tutorial would list every step of every step.
   */
  protected childrenOf(page: DocPage): { id: string; text: string; code: boolean; sub: boolean }[] {
    if (page.apis.length) {
      return page.apis.map((name) => ({
        id: name,
        text: name.split('.')[1] ?? name,
        code: true,
        sub: false,
      }));
    }
    const at = this.fragment();
    let current: string | null = null;
    for (const heading of page.headings) {
      if (heading.level === 2) {
        current = heading.id;
      }
      if (heading.id === at) {
        break;
      }
    }
    const open = page.headings.some((heading) => heading.id === at) ? current : null;
    const out: { id: string; text: string; code: boolean; sub: boolean }[] = [];
    let under: string | null = null;
    for (const heading of page.headings) {
      if (heading.level === 2) {
        under = heading.id;
        out.push({ id: heading.id, text: heading.text, code: false, sub: false });
      } else if (heading.level === 3 && under === open) {
        out.push({ id: heading.id, text: heading.text, code: false, sub: true });
      }
    }
    return out;
  }

  /** Each section header takes the glyph the artboard draws on it. */
  protected iconOf(section: string): IconName {
    if (section === 'start') {
      return 'zap';
    }
    if (section === 'concepts') {
      return 'grid';
    }
    if (section === 'tutorials') {
      return 'play';
    }
    if (section === 'api') {
      return 'code';
    }
    if (section === 'editors') {
      return 'sliders';
    }
    return 'lightbulb';
  }

  protected toggle(id: string): void {
    this.collapsed.update((set) => {
      const next = new Set(set);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      writeJson(STORAGE_KEYS.docsCollapsed, [...next]);
      return next;
    });
  }
}
