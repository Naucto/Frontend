import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { TranslocoDirective } from '@jsverse/transloco';
import { ButtonDirective, IconComponent } from '@naucto/ui';

import { type ApiEntry } from './docs.service';

/** One Lua API function: signature, description, params, notes, examples. Used by /learn, the DOC pane and hover cards. */
@Component({
  selector: 'nc-api-card',
  imports: [TranslocoDirective, ButtonDirective, IconComponent],
  template: `
    <article *transloco="let t" class="doc-html" [id]="entry().name">
      <div class="flex items-baseline gap-1">
        <code class="text-ui text-ink"><span class="text-gold-ink">{{ entry().name }}</span>{{ rest() }}</code>
        <span class="flex-1"></span>
        @if (insertable()) {
          <button ncButton variant="ghost" size="sm" (click)="insert.emit(entry())">
            <nc-icon name="code" [size]="12" />
            {{ t('docs.insert') }}
          </button>
        }
      </div>
      <div class="label mt-0.5 text-ink-4">
        {{ entry().name.split('.')[0] }} · {{ entry().kind }}
        @if (entry().since) {
          · {{ t('docs.since', { v: entry().since }) }}
        }
      </div>
      @if (entry().descriptionHtml) {
        <div class="mt-1" [innerHTML]="trust(entry().descriptionHtml)"></div>
      } @else {
        <p class="mt-1 text-body text-ink-2">{{ entry().summary }}</p>
      }
      @if (entry().params.length) {
        <table class="mt-1 w-full text-meta">
          <tbody>
            @for (p of entry().params; track p.name) {
              <tr>
                <td class="pr-2 font-mono text-ink">{{ p.name }}</td>
                <td class="pr-2 font-mono text-sky-ink">{{ p.type }}</td>
                <td class="text-ink-2" [innerHTML]="trust(p.descriptionHtml)"></td>
              </tr>
            }
          </tbody>
        </table>
      }
      @if (entry().returns) {
        <p class="mt-1 text-meta text-ink-2">
          <span class="label text-ink-4">{{ t('docs.returns') }}</span>
          <span [innerHTML]="trust(entry().returns ?? '')"></span>
        </p>
      }
      @for (n of entry().notes; track $index) {
        <aside class="callout" [class]="n.kind" [innerHTML]="trust(n.html)"></aside>
      }
      @for (ex of entry().examples; track $index) {
        <div class="label mt-1 text-ink-4">{{ t('docs.example') }}</div>
        <pre class="lua"><code [innerHTML]="trust(ex.html)"></code></pre>
      }
      @if (entry().aliases.length || entry().seeAlso.length) {
        <div class="label mt-1 flex flex-wrap gap-2 text-ink-4">
          @if (entry().aliases.length) {
            <span>{{ t('docs.legacy', { names: entry().aliases.join(', ') }) }}</span>
          }
          @if (entry().seeAlso.length) {
            <span>
              {{ t('docs.seeAlso') }}
              @for (s of entry().seeAlso; track s) {
                <button type="button" class="text-gold-ink hover:underline" (click)="navigate.emit(s)">{{ s }}</button>
              }
            </span>
          }
        </div>
      }
    </article>
  `,
  host: { class: 'block border-b border-line py-2' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ApiCardComponent {
  readonly entry = input.required<ApiEntry>();
  readonly insertable = input(false);
  readonly insert = output<ApiEntry>();
  readonly navigate = output<string>();
  private readonly sanitizer = inject(DomSanitizer);
  protected readonly rest = computed(() =>
    (this.entry().signature || this.entry().name).replace(this.entry().name, ''),
  );

  /** Docs HTML is built at compile time from our own repository; it never carries user input. */
  protected trust(html: string): ReturnType<DomSanitizer['bypassSecurityTrustHtml']> {
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }
}
