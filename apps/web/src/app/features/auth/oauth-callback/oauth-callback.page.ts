import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  type OnInit,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthStore } from '@app/core/auth/auth.store';
import { OAuthService } from '@app/core/auth/oauth/oauth.service';
import { type OAuthProviderId } from '@app/core/auth/oauth/oauth-provider';
import { TranslocoDirective } from '@jsverse/transloco';
import { LcdComponent } from '@naucto/ui';

/**
 * Landing page for every OAuth callback. Renders without the app shell so a popup flow stays
 * minimal; a redirect flow lands the whole app here and carries on to where it was going.
 */
@Component({
  selector: 'nc-oauth-callback-page',
  imports: [TranslocoDirective, LcdComponent],
  template: `
    <div *transloco="let t" class="mx-auto mt-8 w-[360px]">
      <nc-lcd [minHeight]="64">{{ t(status()) }}</nc-lcd>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OAuthCallbackPage implements OnInit {
  readonly code = input<string>();
  readonly state = input<string>();
  readonly error = input<string>();
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthStore);
  private readonly oauth = inject(OAuthService);
  protected readonly status = signal('auth.finishing');

  ngOnInit(): void {
    void this.run();
  }

  private async run(): Promise<void> {
    const provider = this.route.snapshot.data.provider as OAuthProviderId;
    const inPopup = this.oauth.provider(provider).kind === 'popup';
    let next: string | null = null;
    try {
      next = this.oauth.consume(provider, this.state() ?? null).next;
      const code = this.code();
      if (this.error() !== undefined || code === undefined)
        throw new Error(this.error() ?? 'missing_code');
      const token = await this.oauth.finish(provider, code);
      if (inPopup) {
        this.oauth.handBack({ token });
        this.status.set('auth.oauthDone');
        window.close();
        return;
      }
      await this.auth.completeOAuth(token);
      await this.router.navigateByUrl(next);
    } catch (e) {
      // The provider's own wording stays off the screen: it is theirs, and it may say anything.
      this.status.set('auth.oauthFailed');
      if (inPopup) {
        this.oauth.handBack({ error: e instanceof Error ? e.message : 'oauth_failed' });
        return;
      }
      setTimeout(() => {
        void this.router.navigate(['/sign-in'], { queryParams: next === null ? {} : { next } });
      }, 1500);
    }
  }
}
