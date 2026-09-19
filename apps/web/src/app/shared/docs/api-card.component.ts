import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { TranslocoDirective } from '@jsverse/transloco';
import { ButtonDirective, IconComponent } from '@naucto/ui';

import { type ApiEntry } from './docs.service';

/** One Lua API function: signature, description, params, notes, examples. Used by /learn and the DOC pane. */
@Component({
  selector: 'nc-api-card',
  imports: [TranslocoDirective, ButtonDirective, IconComponent],
  template: `
    <article *transloco="let t" class="api-card" [id]="entry().name">
      <div class="api-sig">
        <code
          ><span class="api-sig-name">{{ entry().name }}</span
          ><span [innerHTML]="signatureRest()"></span
        ></code>
        @if (insertable()) {
          <button
            ncButton
            variant="ghost"
            size="sm"
            class="api-insert"
            [attr.aria-label]="t('docs.insert')"
            (click)="insert.emit(entry())"
          >
            <nc-icon name="code" [size]="12" />
            <span class="api-insert-word">{{ t('docs.insert') }}</span>
          </button>
        }
      </div>
      <div class="api-meta">
        {{ entry().name.split('.')[0] }} · {{ entry().kind }}
        @if (entry().since) {
          · {{ t('docs.since', { v: entry().since }) }}
        }
      </div>
      @if (entry().descriptionHtml) {
        <div class="doc-html api-prose" [innerHTML]="trust(entry().descriptionHtml)"></div>
      } @else {
        <p class="api-prose">{{ entry().summary }}</p>
      }
      @if (entry().params.length) {
        <div class="api-label">{{ t('docs.parameters') }}</div>
        <dl class="api-params">
          @for (p of entry().params; track p.name) {
            <div class="api-param">
              <dt>
                <code>{{ p.name }}</code>
                <span class="api-param-meta">
                  {{ p.type }}
                  @if (p.optional) {
                    · {{ t('docs.optional') }}
                  }
                </span>
              </dt>
              <dd class="doc-html" [innerHTML]="trust(p.descriptionHtml)"></dd>
            </div>
          }
        </dl>
      }
      @if (entry().kind === 'function') {
        <div class="api-label">{{ t('docs.returns') }}</div>
        @if (entry().returns) {
          <p class="doc-html api-prose" [innerHTML]="trust(entry().returns ?? '')"></p>
        } @else {
          <p class="api-prose api-quiet">{{ t('docs.nothing') }}</p>
        }
      }
      @if (entry().notes.length) {
        <div class="doc-html">
          @for (n of entry().notes; track $index) {
            <aside class="callout" [class]="n.kind" [innerHTML]="trust(n.html)"></aside>
          }
        </div>
      }
      @if (entry().examples.length) {
        <div class="api-label">{{ t('docs.example') }}</div>
        <div class="doc-html">
          @for (ex of entry().examples; track $index) {
            <pre class="lua"><code [innerHTML]="trust(ex.html)"></code></pre>
          }
          @if (entry().pictureHtml) {
            <div [innerHTML]="trust(entry().pictureHtml)"></div>
          }
        </div>
      } @else if (entry().pictureHtml) {
        <div class="doc-html" [innerHTML]="trust(entry().pictureHtml)"></div>
      }
      @if (entry().seeAlso.length) {
        <div class="api-label">{{ t('docs.seeAlso') }}</div>
        <div class="api-refs">
          @for (s of entry().seeAlso; track s) {
            <button type="button" class="api-ref-chip" (click)="navigate.emit(s)">{{ s }}</button>
          }
        </div>
      }
    </article>
  `,
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ApiCardComponent {
  readonly entry = input.required<ApiEntry>();
  readonly insertable = input(false);
  readonly insert = output<ApiEntry>();
  readonly navigate = output<string>();
  private readonly sanitizer = inject(DomSanitizer);
  protected readonly signatureRest = computed(() => {
    const rest = (this.entry().signature || this.entry().name).replace(this.entry().name, '');
    const html = rest
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/\[[^\]]*\]/g, (m) => `<span class="api-sig-opt">${m}</span>`);
    return this.sanitizer.bypassSecurityTrustHtml(html);
  });

  /** Docs HTML is built at compile time from our own repository; it never carries user input. */
  protected trust(html: string): ReturnType<DomSanitizer['bypassSecurityTrustHtml']> {
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }
}
