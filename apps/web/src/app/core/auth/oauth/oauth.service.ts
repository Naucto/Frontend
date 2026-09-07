import { inject, Injectable } from '@angular/core';
import {
  authControllerLoginWithGithub,
  authControllerLoginWithGoogleCode,
  authControllerLoginWithMicrosoft,
} from '@naucto/api-client';

import { unwrap } from '../../api/api-errors';
import { AppConfigService } from '../../config/app-config';
import { readJson, remove, STORAGE_KEYS, writeJson } from '../../storage/local-storage';
import { AuthStore } from '../auth.store';
import { pkceChallenge, randomString } from '../pkce';

export type OAuthProvider = 'google' | 'github' | 'microsoft';

interface PendingOAuth {
  provider: OAuthProvider;
  state: string;
  next: string;
}

/**
 * The three OAuth flows. Google and GitHub redirect the whole page; Microsoft
 * runs in a popup that exchanges the code itself (SPA registration) and posts
 * the id_token back. State/verifier live in sessionStorage only.
 */
@Injectable({ providedIn: 'root' })
export class OAuthService {
  private readonly config = inject(AppConfigService);
  private readonly auth = inject(AuthStore);

  async start(provider: OAuthProvider, next = '/hub'): Promise<void> {
    const cfg = this.config.config();
    const state = randomString(16);
    writeJson(
      STORAGE_KEYS.oauthState,
      { provider, state, next } satisfies PendingOAuth,
      sessionStorage,
    );

    if (provider === 'github') {
      const url = new URL('https://github.com/login/oauth/authorize');
      url.searchParams.set('client_id', cfg.github.clientId);
      url.searchParams.set('redirect_uri', cfg.github.redirectUri);
      url.searchParams.set('scope', 'user:email');
      url.searchParams.set('state', state);
      location.assign(url.toString());
      return;
    }

    const verifier = randomString(48);
    writeJson(STORAGE_KEYS.pkceVerifier, verifier, sessionStorage);
    const challenge = await pkceChallenge(verifier);

    if (provider === 'google') {
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      url.searchParams.set('client_id', cfg.google.clientId);
      url.searchParams.set('redirect_uri', cfg.google.redirectUri);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('scope', 'openid email profile');
      url.searchParams.set('code_challenge', challenge);
      url.searchParams.set('code_challenge_method', 'S256');
      url.searchParams.set('state', state);
      location.assign(url.toString());
      return;
    }

    const url = new URL(
      `https://login.microsoftonline.com/${cfg.microsoft.tenantId}/oauth2/v2.0/authorize`,
    );
    url.searchParams.set('client_id', cfg.microsoft.clientId);
    url.searchParams.set('redirect_uri', cfg.microsoft.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid email profile');
    url.searchParams.set('code_challenge', challenge);
    url.searchParams.set('code_challenge_method', 'S256');
    url.searchParams.set('state', state);
    url.searchParams.set('prompt', 'select_account');
    const popup = window.open(url.toString(), 'naucto-microsoft', 'width=520,height=640');
    if (!popup) throw new Error('popup_blocked');
    await new Promise<void>((resolve, reject) => {
      const onMessage = (
        e: MessageEvent<{ type?: string; token?: string; error?: string }>,
      ): void => {
        if (e.origin !== location.origin) return;
        if (e.data.type === 'naucto:oauth:success' && e.data.token !== undefined) {
          window.removeEventListener('message', onMessage);
          this.auth.completeOAuth(e.data.token).then(resolve, reject);
        } else if (e.data.type === 'naucto:oauth:error') {
          window.removeEventListener('message', onMessage);
          reject(new Error(e.data.error ?? 'oauth_failed'));
        }
      };
      window.addEventListener('message', onMessage);
    });
  }

  /** Validates state and returns where to go next; throws on mismatch. */
  consume(provider: OAuthProvider, state: string | null): PendingOAuth {
    const pending = readJson<PendingOAuth | null>(STORAGE_KEYS.oauthState, null, sessionStorage);
    remove(STORAGE_KEYS.oauthState, sessionStorage);
    if (pending?.provider !== provider || pending.state !== state)
      throw new Error('oauth_state_mismatch');
    return pending;
  }

  takeVerifier(): string {
    const v = readJson<string>(STORAGE_KEYS.pkceVerifier, '', sessionStorage);
    remove(STORAGE_KEYS.pkceVerifier, sessionStorage);
    if (!v) throw new Error('oauth_verifier_missing');
    return v;
  }

  async finishGoogle(code: string): Promise<void> {
    const res = unwrap(
      await authControllerLoginWithGoogleCode({
        body: { code, codeVerifier: this.takeVerifier() },
        credentials: 'include',
      }),
    );
    await this.auth.completeOAuth(res.access_token);
  }

  async finishGithub(code: string): Promise<void> {
    const res = unwrap(
      await authControllerLoginWithGithub({ body: { code }, credentials: 'include' }),
    );
    await this.auth.completeOAuth(res.access_token);
  }

  /** Runs inside the popup: exchange the code with Microsoft, then with our backend; returns the access token. */
  async finishMicrosoftInPopup(code: string): Promise<string> {
    const cfg = this.config.config();
    const body = new URLSearchParams({
      client_id: cfg.microsoft.clientId,
      grant_type: 'authorization_code',
      code,
      redirect_uri: cfg.microsoft.redirectUri,
      code_verifier: this.takeVerifier(),
      scope: 'openid email profile',
    });
    const tokenRes = await fetch(
      `https://login.microsoftonline.com/${cfg.microsoft.tenantId}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      },
    );
    const json = (await tokenRes.json()) as { id_token?: string; error_description?: string };
    if (!json.id_token) throw new Error(json.error_description ?? 'microsoft_token_failed');
    const res = unwrap(
      await authControllerLoginWithMicrosoft({
        body: { token: json.id_token },
        credentials: 'include',
      }),
    );
    return res.access_token;
  }
}
