import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  type OnInit,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { authControllerGetPasswordPolicy, type PasswordPolicyDto } from '@naucto/api-client';
import {
  ButtonDirective,
  FieldComponent,
  InputDirective,
  LogoComponent,
  ToastService,
} from '@naucto/ui';

import { ApiError, unwrap, violationsOf } from '../../core/api/api-errors';
import { AuthStore } from '../../core/auth/auth.store';

/**
 * Where the password reset link lands: a new password, which ends every other session and signs
 * this one in.
 */
@Component({
  selector: 'nc-reset-password-page',
  imports: [
    TranslocoDirective,
    FormsModule,
    ButtonDirective,
    FieldComponent,
    InputDirective,
    LogoComponent,
    RouterLink,
  ],
  templateUrl: './reset-password.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class ResetPasswordPage implements OnInit {
  readonly token = input<string>();
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);
  private readonly i18n = inject(TranslocoService);
  protected readonly busy = signal(false);
  protected readonly expired = signal(false);
  protected readonly policy = signal<PasswordPolicyDto | null>(null);
  protected password = '';

  ngOnInit(): void {
    if (!this.token()) {
      this.expired.set(true);
      return;
    }
    // A failure leaves the hint empty; the server still enforces the rule.
    void authControllerGetPasswordPolicy()
      .then(unwrap)
      .then((policy) => {
        this.policy.set(policy);
      })
      .catch(() => undefined);
  }

  protected passwordHint(): string {
    const policy = this.policy();
    return policy
      ? this.i18n.translate('auth.passwordHint', {
          length: policy.minLength,
          classes: policy.minCharacterClasses,
        })
      : '';
  }

  protected async submit(): Promise<void> {
    const token = this.token();
    if (!token) {
      return;
    }
    this.busy.set(true);
    try {
      await this.auth.resetPassword(token, this.password);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'INVALID_EMAIL_TOKEN') {
        this.expired.set(true);
      } else {
        this.toasts.show(this.explain(err), 'error');
      }
      return;
    } finally {
      this.busy.set(false);
    }
    this.toasts.show(this.i18n.translate('auth.reset.done'), 'success');
    // Replaces this entry, so going back never shows a form for a spent token.
    await this.router.navigateByUrl('/hub', { replaceUrl: true });
  }

  private explain(err: unknown): string {
    for (const violation of violationsOf(err)) {
      const key = `auth.errors.${violation.code}`;
      const said = this.i18n.translate(key);
      if (said !== key) {
        return said;
      }
    }
    return this.i18n.translate('auth.reset.failed');
  }
}
