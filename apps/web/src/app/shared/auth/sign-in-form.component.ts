import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  model,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { authControllerGetPasswordPolicy, type PasswordPolicyDto } from '@naucto/api-client';
import {
  BrandMarkComponent,
  ButtonDirective,
  FieldComponent,
  InputDirective,
  ToastService,
} from '@naucto/ui';

import { ApiError, unwrap, violationsOf } from '../../core/api/api-errors';
import { AuthStore } from '../../core/auth/auth.store';
import { OAuthService } from '../../core/auth/oauth/oauth.service';
import { type OAuthProviderFlow } from '../../core/auth/oauth/oauth-provider';

/**
 * How long the resend button stays down after a link is mailed. It mirrors the backend's
 * `EMAIL_TOKEN_COOLDOWN_MS`, which answers 204 without mailing anything before then: change both
 * together.
 */
export const RESEND_COOLDOWN_SECONDS = 60;

type InboxReason = 'registered' | 'unverified' | 'reset';

/** What the form is doing; its host titles itself after it. */
export type SignInMode = 'login' | 'register' | 'forgot' | 'inbox';

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
  templateUrl: './sign-in-form.component.html',
  host: { '(window:pageshow)': 'onPageShow($event)' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignInFormComponent {
  /** Where a provider that leaves the page should bring the reader back to. */
  readonly next = input<string>();
  readonly succeeded = output();

  private readonly auth = inject(AuthStore);
  private readonly oauthService = inject(OAuthService);
  private readonly i18n = inject(TranslocoService);
  private readonly toasts = inject(ToastService);

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      clearInterval(this.resendTimer);
    });
  }

  /** A provider the server registered no client with is drawn, but down: it says what is missing. */
  protected readonly providers = computed(() =>
    this.oauthService
      .providers()
      .map((flow) => ({ flow, configured: this.oauthService.isConfigured(flow.id) })),
  );
  readonly mode = model<SignInMode>('login');
  /** Why the form now waits on a mailed link, which decides what it says and whether it resends. */
  protected readonly inboxReason = signal<InboxReason>('registered');
  /** The address the last link went to, kept apart from the field the reader may edit. */
  protected readonly sentTo = signal('');
  protected readonly busy = signal(false);
  /** Seconds before the resend button comes back; 0 when it is up. */
  protected readonly resendIn = signal(0);
  private resendTimer: ReturnType<typeof setInterval> | undefined;
  protected readonly policy = signal<PasswordPolicyDto | null>(null);
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
    void authControllerGetPasswordPolicy()
      .then(unwrap)
      .then((policy) => {
        this.policy.set(policy);
      })
      .catch(() => undefined);
  }

  protected forgot(): void {
    this.mode.set('forgot');
  }

  protected async submit(): Promise<void> {
    this.busy.set(true);
    try {
      switch (this.mode()) {
        case 'register':
          this.awaitLink(
            'registered',
            await this.auth.register({
              email: this.email,
              password: this.password,
              username: this.username,
            }),
          );
          return;
        case 'forgot':
          await this.auth.forgotPassword(this.email);
          this.awaitLink('reset', this.email);
          return;
        default:
          await this.auth.loginWithPassword(this.email, this.password);
          this.succeeded.emit();
      }
    } catch (err) {
      if (err instanceof ApiError && err.code === 'EMAIL_NOT_VERIFIED') {
        this.awaitLink('unverified', this.email);
        return;
      }
      this.toasts.show(this.explain(err), 'error');
    } finally {
      this.busy.set(false);
    }
  }

  /** Mails the confirmation link again; the server sends at most one a minute. */
  protected async resend(): Promise<void> {
    this.busy.set(true);
    try {
      await this.auth.resendVerification(this.sentTo());
      this.startResendCooldown();
      this.toasts.show(this.i18n.translate('auth.inbox.resent'), 'success');
    } catch {
      this.toasts.show(this.i18n.translate('auth.inbox.resendFailed'), 'error');
    } finally {
      this.busy.set(false);
    }
  }

  protected backToSignIn(): void {
    this.password = '';
    this.mode.set('login');
  }

  private awaitLink(reason: InboxReason, email: string): void {
    this.inboxReason.set(reason);
    this.sentTo.set(email);
    this.mode.set('inbox');
    this.startResendCooldown();
  }

  private startResendCooldown(): void {
    clearInterval(this.resendTimer);
    this.resendIn.set(RESEND_COOLDOWN_SECONDS);
    this.resendTimer = setInterval(() => {
      this.resendIn.update((seconds) => seconds - 1);
      if (this.resendIn() <= 0) {
        clearInterval(this.resendTimer);
      }
    }, 1000);
  }

  /**
   * What went wrong, in this app's words where it knows the rule and the server's where it does
   * not. A code the catalogue has no entry for would otherwise render as its own key.
   */
  private explain(err: unknown): string {
    for (const violation of violationsOf(err)) {
      const key = `auth.errors.${violation.code}`;
      const said = this.i18n.translate(key);
      if (said !== key) {
        return said;
      }
    }
    if (err instanceof ApiError && err.message) {
      return err.message;
    }
    switch (this.mode()) {
      case 'register':
        return this.i18n.translate('auth.registerFailed');
      case 'forgot':
        return this.i18n.translate('auth.forgot.failed');
      default:
        return this.i18n.translate('auth.failed');
    }
  }

  protected async oauth(provider: OAuthProviderFlow): Promise<void> {
    this.busy.set(true);
    let leftPage = false;
    try {
      leftPage =
        (await this.oauthService.start(provider.id, this.next() ?? '/hub')) === 'left-page';
      if (!leftPage) {
        this.succeeded.emit();
      }
    } catch {
      this.toasts.show(this.i18n.translate('auth.oauthFailed'), 'error');
    } finally {
      // A page on its way out keeps its buttons down; every other ending gives them back.
      if (!leftPage) {
        this.busy.set(false);
      }
    }
  }

  /**
   * The back button on a provider's page restores this one from the browser's cache as it was
   * left: buttons down, and a state in sessionStorage that no callback will ever answer.
   */
  protected onPageShow(event: PageTransitionEvent): void {
    if (!event.persisted) {
      return;
    }
    this.busy.set(false);
    this.oauthService.abandon();
  }
}
