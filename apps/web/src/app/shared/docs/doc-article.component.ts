import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';

import { ApiCardComponent } from './api-card.component';
import { type ApiEntry, type DocPage, DocsService } from './docs.service';

type Segment = { kind: 'html'; html: SafeHtml } | { kind: 'api'; entry: ApiEntry };

/** Renders a built page: HTML chunks interleaved with live API cards where the page asked for them. */
@Component({
  selector: 'nc-doc-article',
  imports: [ApiCardComponent],
  template: `
    <div class="doc-html">
      @for (s of segments(); track $index) {
        @if (s.kind === 'html') {
          <div [innerHTML]="s.html"></div>
        } @else {
          <nc-api-card [entry]="s.entry" [insertable]="insertable()" (insert)="insert.emit($event)" (navigate)="navigate.emit($event)" />
        }
      }
    </div>
  `,
  host: { class: 'block', '(click)': 'onClick($event)' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocArticleComponent {
  readonly page = input.required<DocPage>();
  readonly insertable = input(false);
  readonly insert = output<ApiEntry>();
  /** A link to /learn/… or an api ref was clicked. */
  readonly navigate = output<string>();
  private readonly docs = inject(DocsService);
  private readonly sanitizer = inject(DomSanitizer);

  protected readonly segments = computed<Segment[]>(() => {
    const out: Segment[] = [];
    const re = /<div class="api-card" data-api="([a-z]+\.[a-z_]+)"><\/div>/g;
    const html = this.page().html;
    let last = 0;
    for (const m of html.matchAll(re)) {
      if (m.index > last) out.push({ kind: 'html', html: this.sanitizer.bypassSecurityTrustHtml(html.slice(last, m.index)) });
      const entry = this.docs.lookup(m[1] ?? '');
      if (entry) out.push({ kind: 'api', entry });
      last = m.index + m[0].length;
    }
    if (last < html.length) out.push({ kind: 'html', html: this.sanitizer.bypassSecurityTrustHtml(html.slice(last)) });
    return out;
  });

  protected onClick(e: MouseEvent): void {
    const a = (e.target as HTMLElement).closest('a');
    if (!a) return;
    const api = a.dataset.api;
    const href = a.getAttribute('href') ?? '';
    if (api) {
      e.preventDefault();
      this.navigate.emit(api);
    } else if (href.startsWith('/')) {
      e.preventDefault();
      this.navigate.emit(href);
    }
  }
}
