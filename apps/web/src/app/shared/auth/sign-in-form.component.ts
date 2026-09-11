import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiError, violationsOf } from '@app/core/api/api-errors';
import {
  getPasswordPolicy,
  type PasswordPolicyDto as PasswordPolicy,
} from '@app/core/api/planned.api';
import { AuthStore } from '@app/core/auth/auth.store';
import { type OAuthProvider, OAuthService } from '@app/core/auth/oauth/oauth.service';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import {
  BrandMarkComponent,
  ButtonDirective,
  FieldComponent,
  InputDirective,
  ToastService,
} from '@naucto/ui';

/**
 * The credentials half of signing in, without an opinion about where you end up.
 *
 * It lives in shared rather than beside the page because the editor has to be able to ask for a
 * sign-in over what it is already doing, and nothing in shared may reach into features.
 */
@Component({
  selector: 'nc-sign-in-form',
  imports: [
    FormsModule,
    TranslocoDirective,
    BrandMarkComponent,
    ButtonDirective,
    FieldComponent,
    InputDirective,
  ],
  template: `
    <ng-container *transloco="let t">
      <form class="grid gap-2" (ngSubmit)="submit()" novalidate>
        @if (mode() === 'register') {
          <nc-field [label]="t('auth.username')" for="username">
            <input
              ncInput
              id="username"
              name="username"
              autocomplete="username"
              required
              minlength="3"
              [(ngModel)]="username"
            />
          </nc-field>
        }
        <nc-field [label]="t('auth.email')" for="email">
          <input
            ncInput
            id="email"
            name="email"
            type="email"
            autocomplete="email"
            required
            [(ngModel)]="email"
          />
        </nc-field>
        <nc-field
          [label]="t('auth.password')"
          for="password"
          [hint]="mode() === 'register' ? passwordHint() : ''"
        >
          <input
            ncInput
            id="password"
            name="password"
            type="password"
            [attr.autocomplete]="mode() === 'register' ? 'new-password' : 'current-password'"
            required
            [attr.minlength]="mode() === 'register' ? policy()?.minLength : null"
            [(ngModel)]="password"
          />
        </nc-field>
        <button
          ncButton
          variant="primary"
          size="lg"
          type="submit"
          class="mt-1 w-full"
          [disabled]="busy()"
        >
          {{ mode() === 'register' ? t('auth.create') : t('auth.signIn') }}
        </button>
      </form>

      <div class="my-2 flex items-center gap-2">
        <span class="h-px flex-1 bg-line-soft"></span>
        <span class="label text-ink-4">{{ t('auth.or') }}</span>
        <span class="h-px flex-1 bg-line-soft"></span>
      </div>
      <div class="grid grid-cols-1 gap-1 sm:grid-cols-3">
        <button
          ncButton
          variant="secondary"
          size="sm"
          class="h-[36px] text-ink-body"
          (click)="oauth('google')"
          [disabled]="busy()"
        >
          <nc-brand-mark name="google" [size]="12" />
          Google
        </button>
        <button
          ncButton
          variant="secondary"
          size="sm"
          class="h-[36px] text-ink-body"
          (click)="oauth('github')"
          [disabled]="busy()"
        >
          <nc-brand-mark name="github" [size]="12" />
          GitHub
        </button>
        <button
          ncButton
          variant="secondary"
          size="sm"
          class="h-[36px] text-ink-body"
          (click)="oauth('microsoft')"
          [disabled]="busy()"
        >
          <nc-brand-mark name="microsoft" [size]="12" />
          Microsoft
        </button>
      </div>

      <p class="mt-3 text-center text-meta text-ink-3">
        @if (mode() === 'login') {
          {{ t('auth.noAccount') }}
          <button type="button" class="text-gold-ink hover:underline" (click)="register()">
            {{ t('auth.register') }}
          </button>
          {{ t('auth.takes20') }}
        } @else {
          {{ t('auth.haveAccount') }}
          <button type="button" class="text-gold-ink hover:underline" (click)="mode.set('login')">
            {{ t('auth.signIn') }}
          </button>
        }
      </p>
    </ng-container>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignInFormComponent {
  /** Where an OAuth provider should return to; it is a full page redirect for two of the three. */
  readonly next = input<string>();
  readonly succeeded = output();

  private readonly auth = inject(AuthStore);
  private readonly oauthService = inject(OAuthService);
  private readonly i18n = inject(TranslocoService);
  private readonly toasts = inject(ToastService);

  protected readonly mode = signal<'login' | 'register'>('login');
  protected readonly busy = signal(false);
  protected readonly policy = signal<PasswordPolicy | null>(null);
  protected email = '';
  protected password = '';
  protected username = '';

  /** The rule as the API states it, so this form never keeps a second copy of the numbers. */
  protected passwordHint(): string {
    const policy = this.policy();
    return policy
      ? this.i18n.translate('auth.passwordHint', {
          length: policy.minLength,
          classes: policy.minCharacterClasses,
        })
      : '';
  }

  protected register(): void {
    this.mode.set('register');
    // Asked for on the way in rather than at boot: signing in is the common path and needs none of
    // it. A failure leaves the hint empty and the server still enforces the rule.
    void getPasswordPolicy()
      .then((policy) => {
        this.policy.set(policy);
      })
      .catch(() => undefined);
  }

  protected async submit(): Promise<void> {
    this.busy.set(true);
    try {
      if (this.mode() === 'register')
        await this.auth.register({
          email: this.email,
          password: this.password,
          username: this.username,
        });
      else await this.auth.loginWithPassword(this.email, this.password);
      this.succeeded.emit();
    } catch (err) {
      this.toasts.show(this.explain(err), 'error');
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * What went wrong, in this app's words where it knows the rule and the server's where it does
   * not. A code the catalogue has no entry for would otherwise render as its own key.
   */
  private explain(err: unknown): string {
    for (const violation of violationsOf(err)) {
      const key = `auth.errors.${violation.code}`;
      const said = this.i18n.translate(key);
      if (said !== key) return said;
    }
    if (err instanceof ApiError && err.message) return err.message;
    return this.i18n.translate(this.mode() === 'register' ? 'auth.registerFailed' : 'auth.failed');
  }

  protected async oauth(provider: OAuthProvider): Promise<void> {
    this.busy.set(true);
    try {
      await this.oauthService.start(provider, this.next() ?? '/hub');
      // Google and GitHub leave the page entirely; only the popup provider returns to this one.
      if (provider === 'microsoft') this.succeeded.emit();
    } catch {
      this.toasts.show(this.i18n.translate('auth.oauthFailed', { provider }), 'error');
      this.busy.set(false);
    }
  }
}
