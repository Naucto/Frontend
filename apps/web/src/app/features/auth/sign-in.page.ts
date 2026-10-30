import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { LogoComponent } from '@naucto/ui';

import { SignInFormComponent, type SignInMode } from '../../shared/auth/sign-in-form.component';
import { signInHeadings } from '../../shared/auth/sign-in-headings';

const HEADINGS = signInHeadings({ title: 'auth.insertGame', lead: 'auth.tagline' });

/** "Insert game" — the sign-in form on its own page, which then goes wherever it was sent from. */
@Component({
  selector: 'nc-sign-in-page',
  imports: [TranslocoDirective, SignInFormComponent, LogoComponent],
  templateUrl: './sign-in.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class SignInPage {
  readonly next = input<string>();
  private readonly router = inject(Router);
  protected readonly mode = signal<SignInMode>('login');
  protected readonly heading = computed(() => HEADINGS[this.mode()]);

  /** Only same-origin paths are accepted as a post-login target. */
  protected safeNext(): string {
    const requestedNext = this.next();
    return requestedNext && requestedNext.startsWith('/') && !requestedNext.startsWith('//')
      ? requestedNext
      : '/hub';
  }

  protected go(): void {
    void this.router.navigateByUrl(this.safeNext());
  }
}
