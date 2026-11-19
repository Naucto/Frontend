import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  type OnInit,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { ButtonDirective, LcdComponent, LogoComponent } from '@naucto/ui';

import { ApiError } from '../../core/api/api-errors';
import { AuthStore } from '../../core/auth/auth.store';

/**
 * Where the link mailed at registration lands: it confirms the address, which signs the account in,
 * and goes on to the hub. A link that no longer works says so and points back to signing in, which
 * offers to send another. Anything else (no network, a timeout, a 502) leaves the link alone and
 * offers to try again, since asking for another would spend a link that still works.
 */
@Component({
  selector: 'nc-verify-email-page',
  imports: [TranslocoDirective, ButtonDirective, LcdComponent, LogoComponent, RouterLink],
  templateUrl: './verify-email.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class VerifyEmailPage implements OnInit {
  readonly token = input<string>();
  protected readonly auth = inject(AuthStore);
  protected readonly status = signal<'working' | 'done' | 'failed' | 'error'>('working');

  ngOnInit(): void {
    void this.run();
  }

  protected async run(): Promise<void> {
    const token = this.token();
    if (!token) {
      this.status.set('failed');
      return;
    }
    this.status.set('working');
    try {
      await this.auth.verifyEmail(token);
      this.status.set('done');
    } catch (err) {
      this.status.set(
        err instanceof ApiError && err.code === 'INVALID_EMAIL_TOKEN' ? 'failed' : 'error',
      );
    }
  }
}
