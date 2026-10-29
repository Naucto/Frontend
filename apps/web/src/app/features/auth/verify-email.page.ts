import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  type OnInit,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { ButtonDirective, LcdComponent, LogoComponent, ToastService } from '@naucto/ui';

import { AuthStore } from '../../core/auth/auth.store';

/**
 * Where the link mailed at registration lands: it confirms the address, which signs the account in,
 * and goes on to the hub. A link that no longer works says so and points back to signing in, which
 * offers to send another.
 */
@Component({
  selector: 'nc-verify-email-page',
  imports: [TranslocoDirective, ButtonDirective, LcdComponent, LogoComponent, RouterLink],
  templateUrl: './verify-email.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class VerifyEmailPage implements OnInit {
  readonly token = input<string>();
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);
  private readonly i18n = inject(TranslocoService);
  protected readonly status = signal<'working' | 'failed'>('working');

  ngOnInit(): void {
    void this.run();
  }

  private async run(): Promise<void> {
    const token = this.token();
    if (!token) {
      this.status.set('failed');
      return;
    }
    try {
      await this.auth.verifyEmail(token);
    } catch {
      this.status.set('failed');
      return;
    }
    this.toasts.show(this.i18n.translate('auth.verify.done'), 'success');
    await this.router.navigateByUrl('/hub', { replaceUrl: true });
  }
}
