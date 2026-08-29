import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  type OnInit,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { type OAuthProvider, OAuthService } from '@app/core/auth/oauth/oauth.service';
import { TranslocoDirective } from '@jsverse/transloco';
import { LcdComponent } from '@naucto/ui';

/**
 * Landing page for the three OAuth redirects. Renders without the app shell so
 * the Microsoft popup stays minimal; Google/GitHub redirect the full page here.
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
  private readonly oauth = inject(OAuthService);
  protected readonly status = signal('> connecting…');

  ngOnInit(): void {
    void this.run();
  }

  private async run(): Promise<void> {
    const provider = this.route.snapshot.data.provider as OAuthProvider;
    const code = this.code();
    try {
      if (this.error() !== undefined || code === undefined)
        throw new Error(this.error() ?? 'missing_code');
      const pending = this.oauth.consume(provider, this.state() ?? null);
      if (provider === 'microsoft') {
        const token = await this.oauth.finishMicrosoftInPopup(code);
        opener()?.postMessage({ type: 'naucto:oauth:success', token }, location.origin);
        this.status.set('> signed in — you can close this window');
        window.close();
        return;
      }
      if (provider === 'google') await this.oauth.finishGoogle(code);
      else await this.oauth.finishGithub(code);
      await this.router.navigateByUrl(pending.next);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'oauth_failed';
      this.status.set(`! ${message}`);
      if (provider === 'microsoft') {
        opener()?.postMessage({ type: 'naucto:oauth:error', error: message }, location.origin);
        return;
      }
      setTimeout(() => void this.router.navigateByUrl('/sign-in'), 1500);
    }
  }
}

const opener = (): Window | null => window.opener as Window | null;
