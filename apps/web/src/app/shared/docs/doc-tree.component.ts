import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { IconComponent } from '@naucto/ui';

import { DocsService } from './docs.service';

/** The documentation tree: sections → pages, with the API namespaces counted. */
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
                @if (p.namespace && countOf(p.namespace)) {
                  <span class="label text-ink-4">{{ countOf(p.namespace) }} fn</span>
                }
              </button>
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
  readonly open = output<string>();
  protected readonly docs = inject(DocsService);
  private readonly i18n = inject(TranslocoService);
  protected readonly collapsed = signal(new Set<string>());
  private readonly counts = computed(() => new Map(this.docs.namespaces().map((n) => [n.namespace, n.functions.length])));

  protected countOf(ns: string): number {
    return this.counts().get(ns) ?? 0;
  }

  protected iconOf(section: string): 'zap' | 'lightbulb' | 'play' | 'code' | 'sliders' | 'book-open' {
    return section === 'start' ? 'zap' : section === 'concepts' ? 'lightbulb' : section === 'tutorials' ? 'play' : section === 'api' ? 'code' : section === 'editors' ? 'sliders' : 'book-open';
  }

  protected toggle(id: string): void {
    this.collapsed.update((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  protected label(key: string): string {
    return this.i18n.translate(key);
  }
}
