import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { LogoComponent } from '@naucto/ui';

import { SignInFormComponent } from '../../shared/auth/sign-in-form.component';

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
