import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { SignInFormComponent } from '@app/shared/auth/sign-in-form.component';
import { TranslocoDirective } from '@jsverse/transloco';

/** "Insert game" — the sign-in form on its own page, which then goes wherever it was sent from. */
@Component({
  selector: 'nc-sign-in-page',
  imports: [TranslocoDirective, SignInFormComponent],
  template: `
    <section
      *transloco="let t"
      class="mx-auto mt-6 w-full max-w-[436px] rounded-md border border-line bg-panel px-3.5 pt-3.5 pb-3.25"
    >
      <!-- A wordmark, as the artboard has it: the bare glyph reads as decoration on a card that is
           otherwise all field labels. Same pairing the footer uses. -->
      <div class="mb-2 flex items-center gap-1">
        <img src="/img/logo.svg" alt="" width="22" height="22" />
        <span class="text-title text-ink">Naucto</span>
      </div>
      <h1 class="mt-2 text-[22px] leading-[1.2] text-ink">{{ t('auth.insertGame') }}</h1>
      <p class="mt-1 mb-3 text-body text-ink-3">{{ t('auth.tagline') }}</p>

      <nc-sign-in-form [next]="safeNext()" (succeeded)="go()" />
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignInPage {
  readonly next = input<string>();
  private readonly router = inject(Router);

  /** Only same-origin paths are accepted as a post-login target. */
  protected safeNext(): string {
    const n = this.next();
    return n && n.startsWith('/') && !n.startsWith('//') ? n : '/hub';
  }

  protected go(): void {
    void this.router.navigateByUrl(this.safeNext());
  }
}
