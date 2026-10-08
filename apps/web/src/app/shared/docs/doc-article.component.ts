import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';

import { ApiCardComponent } from './api-card.component';
import { type ApiEntry, type DocPage, DocsService } from './docs.service';

type Segment = { kind: 'html'; html: SafeHtml } | { kind: 'api'; entry: ApiEntry };

/** Renders a built page: HTML chunks interleaved with live API cards where the page asked for them. */
@Component({
  selector: 'nc-doc-article',
  imports: [ApiCardComponent],
  templateUrl: './doc-article.component.html',
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
    // Any name the build wrote; `lookup` drops one the index does not hold. Lua's base functions
    // carry no namespace and `utf8` has a digit, so the name is not narrowed to `ns.fn`.
    const re = /<div class="api-card" data-api="([\w.]+)"><\/div>/g;
    const html = this.page().html;
    let last = 0;
    for (const match of html.matchAll(re)) {
      if (match.index > last) {
        out.push({
          kind: 'html',
          html: this.sanitizer.bypassSecurityTrustHtml(html.slice(last, match.index)),
        });
      }
      const entry = this.docs.lookup(match[1] ?? '');
      if (entry) {
        out.push({ kind: 'api', entry });
      }
      last = match.index + match[0].length;
    }
    if (last < html.length) {
      out.push({ kind: 'html', html: this.sanitizer.bypassSecurityTrustHtml(html.slice(last)) });
    }
    return out;
  });

  protected onClick(event: MouseEvent): void {
    const anchor = (event.target as HTMLElement).closest('a');
    if (!anchor) {
      return;
    }
    const api = anchor.dataset.api;
    const href = anchor.getAttribute('href') ?? '';
    if (api) {
      event.preventDefault();
      this.navigate.emit(api);
    } else if (href.startsWith('/')) {
      event.preventDefault();
      this.navigate.emit(href);
    }
  }
}
