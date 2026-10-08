import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { TranslocoDirective } from '@jsverse/transloco';
import { ButtonDirective, IconComponent } from '@naucto/ui';

import { type ApiEntry } from './docs.service';
import { signatureHtml, typeHtml } from './type-tone';

/** One Lua API entry: signature, description, params, notes, examples. */
@Component({
  selector: 'nc-api-card',
  imports: [TranslocoDirective, ButtonDirective, IconComponent],
  templateUrl: './api-card.component.html',
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
    if (!returns) {
      return null;
    }
    return this.trust(returnType ? `${typeHtml(returnType)} ${returns}` : returns);
  });
}
