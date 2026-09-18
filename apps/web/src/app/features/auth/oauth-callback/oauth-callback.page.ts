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
      <nc-lcd [minHeight]="64">{{ status() }}</nc-lcd>
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
  protected readonly status = signal('> connecting…');

  ngOnInit(): void {
    void this.run();
  }

  private async run(): Promise<void> {
    const provider = this.route.snapshot.data.provider as OAuthProviderId;
    const inPopup = this.oauth.provider(provider).kind === 'popup';
    const code = this.code();
    try {
      if (this.error() !== undefined || code === undefined)
        throw new Error(this.error() ?? 'missing_code');
      const pending = this.oauth.consume(provider, this.state() ?? null);
      const token = await this.oauth.finish(provider, code);
      if (inPopup) {
        this.oauth.handBack({ token });
        this.status.set('> signed in — you can close this window');
        window.close();
        return;
      }
      await this.auth.completeOAuth(token);
      await this.router.navigateByUrl(pending.next);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'oauth_failed';
      this.status.set(`! ${message}`);
      if (inPopup) {
        this.oauth.handBack({ error: message });
        return;
      }
      setTimeout(() => void this.router.navigateByUrl('/sign-in'), 1500);
    }
  }
}
