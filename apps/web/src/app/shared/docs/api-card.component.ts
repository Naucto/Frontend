import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { TranslocoDirective } from '@jsverse/transloco';
import { ButtonDirective, IconComponent } from '@naucto/ui';

import { type ApiEntry } from './docs.service';
import { signatureHtml, typeHtml } from './type-tone';

/** One Lua API function: signature, description, params, notes, examples. Used by /learn and the DOC pane. */
@Component({
  selector: 'nc-api-card',
  imports: [TranslocoDirective, ButtonDirective, IconComponent],
  template: `
    <article *transloco="let t" class="api-card" [id]="entry().name">
      <div class="api-sig">
        <code [innerHTML]="signature()"></code>
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
        {{
          t(entry().since ? 'docs.metaKindSince' : 'docs.metaKind', {
            kind: entry().kind,
            ns: entry().name.split('.')[0],
            v: entry().since,
          })
        }}
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
                <span [innerHTML]="type(p.type)"></span>
                @if (p.optional) {
                  <span class="nc-opt">{{ t('docs.optional') }}</span>
                }
              </dt>
              <dd class="doc-html" [innerHTML]="trust(p.descriptionHtml)"></dd>
            </div>
          }
        </dl>
      }
      @if (entry().kind === 'function') {
        <div class="api-label">{{ t('docs.returns') }}</div>
        @if (returns(); as html) {
          <p class="doc-html api-prose" [innerHTML]="html"></p>
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

  /** Docs HTML is built at compile time from our own repository; it never carries user input. */
  protected trust(html: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  protected type(type: string): SafeHtml {
    return this.trust(typeHtml(type));
  }

  protected readonly signature = computed(() => this.trust(signatureHtml(this.entry())));

  protected readonly returns = computed(() => {
    const { returns, returnType } = this.entry();
    if (!returns) return null;
    return this.trust(returnType ? `${typeHtml(returnType)} ${returns}` : returns);
  });
}
