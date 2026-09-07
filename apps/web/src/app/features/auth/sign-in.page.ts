import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthStore } from '@app/core/auth/auth.store';
import { type OAuthProvider, OAuthService } from '@app/core/auth/oauth/oauth.service';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { BrandMarkComponent, ButtonDirective, FieldComponent, InputDirective } from '@naucto/ui';

/** "Insert game" — email/password sign-in or registration, plus the three OAuth providers. */
@Component({
  selector: 'nc-sign-in-page',
  imports: [
    FormsModule,
    TranslocoDirective,
    BrandMarkComponent,
    ButtonDirective,
    FieldComponent,
    InputDirective,
  ],
  template: `
    <section
      *transloco="let t"
      class="mx-auto mt-6 w-full max-w-[436px] rounded-md border border-line bg-panel px-3.5 pt-3.5 pb-3.25"
    >
      <!-- A wordmark, as the artboard has it: the bare glyph reads as decoration on a card that is
           otherwise all field labels. Same pairing the footer uses. -->
      <div class="mb-2 flex items-center gap-1">
        <img src="/img/logo.png" alt="" width="22" height="22" class="pixelated" />
        <span class="text-title text-ink">Naucto</span>
      </div>
      <h1 class="mt-2 text-[22px] leading-[1.2] text-ink">{{ t('auth.insertGame') }}</h1>
      <p class="mb-3 text-body text-ink-3">{{ t('auth.tagline') }}</p>

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
        <nc-field [label]="t('auth.password')" for="password" [error]="error()">
          <input
            ncInput
            id="password"
            name="password"
            type="password"
            [attr.autocomplete]="mode() === 'register' ? 'new-password' : 'current-password'"
            required
            minlength="8"
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
          <button
            type="button"
            class="text-gold-ink hover:underline"
            (click)="mode.set('register')"
          >
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
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignInPage {
  readonly next = input<string>();
  private readonly auth = inject(AuthStore);
  private readonly oauthService = inject(OAuthService);
  private readonly router = inject(Router);
  private readonly i18n = inject(TranslocoService);

  protected readonly mode = signal<'login' | 'register'>('login');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | undefined>(undefined);
  protected email = '';
  protected password = '';
  protected username = '';

  protected async submit(): Promise<void> {
    this.busy.set(true);
    this.error.set(undefined);
    try {
      if (this.mode() === 'register')
        await this.auth.register({
          email: this.email,
          password: this.password,
          username: this.username,
        });
      else await this.auth.loginWithPassword(this.email, this.password);
      await this.router.navigateByUrl(this.safeNext());
    } catch {
      this.error.set(
        this.i18n.translate(this.mode() === 'register' ? 'auth.registerFailed' : 'auth.failed'),
      );
    } finally {
      this.busy.set(false);
    }
  }

  protected async oauth(provider: OAuthProvider): Promise<void> {
    this.busy.set(true);
    this.error.set(undefined);
    try {
      await this.oauthService.start(provider, this.safeNext());
      if (provider === 'microsoft') await this.router.navigateByUrl(this.safeNext());
    } catch {
      this.error.set(this.i18n.translate('auth.oauthFailed', { provider }));
      this.busy.set(false);
    }
  }

  /** Only same-origin paths are accepted as a post-login target. */
  private safeNext(): string {
    const n = this.next();
    return n && n.startsWith('/') && !n.startsWith('//') ? n : '/hub';
  }
}
