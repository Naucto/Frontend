import { inject, Injectable } from '@angular/core';

import { AppConfigService } from '../../config/app-config';
import { readJson, remove, STORAGE_KEYS, writeJson } from '../../storage/local-storage';
import { AuthStore } from '../auth.store';
import { pkceChallenge, randomString } from '../pkce';
import {
  OAuthError,
  type OAuthProviderFlow,
  type OAuthProviderId,
  type OAuthStartContext,
} from './oauth-provider';
import { OAUTH_PROVIDERS } from './providers';

interface PendingOAuth {
  provider: OAuthProviderId;
  state: string;
  next: string;
}

/** What a popup's callback page hands back to the page that opened it. */
export type OAuthHandBack = { token: string } | { error: string };

type PopupMessage =
  { type: 'naucto:oauth:success'; token: string } | { type: 'naucto:oauth:error'; error: string };

const POPUP_TIMEOUT_MS = 2 * 60_000;
const POPUP_CLOSED_POLL_MS = 500;

/**
 * Resolves with the token the popup's callback posts back — from this origin only.
 *
 * A message is the only thing the popup can send, and two of its endings send none: a window
 * closed by hand, and the provider's own error page, where nothing of ours ever runs. Either
 * would leave the caller waiting for good, so the window is watched as well as listened to.
 */
function awaitPopup(popup: Window, timeoutMs = POPUP_TIMEOUT_MS): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const settle = (outcome: () => void): void => {
      clearInterval(closedPoll);
      clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      outcome();
    };
    const onMessage = (e: MessageEvent<Partial<PopupMessage>>): void => {
      if (e.origin !== location.origin) return;
      if (e.data.type === 'naucto:oauth:success' && e.data.token !== undefined) {
        const { token } = e.data;
        settle(() => {
          resolve(token);
        });
      } else if (e.data.type === 'naucto:oauth:error') {
        const reason = e.data.error ?? 'oauth_failed';
        settle(() => {
          reject(new Error(reason));
        });
      }
    };
    const closedPoll = setInterval(() => {
      if (popup.closed)
        settle(() => {
          reject(new OAuthError('popup_closed'));
        });
    }, POPUP_CLOSED_POLL_MS);
    const timer = setTimeout(() => {
      popup.close();
      settle(() => {
        reject(new OAuthError('popup_timeout'));
      });
    }, timeoutMs);
    window.addEventListener('message', onMessage);
  });
}

/**
 * Sends someone off to an OAuth provider and takes them back in.
 *
 * State and verifier live in sessionStorage only, which a popup inherits a copy of when it opens.
 */
@Injectable({ providedIn: 'root' })
export class OAuthService {
  private readonly config = inject(AppConfigService);
  private readonly auth = inject(AuthStore);
  private readonly flows = inject(OAUTH_PROVIDERS);

  providers(): readonly OAuthProviderFlow[] {
    return this.flows;
  }

  provider(id: OAuthProviderId): OAuthProviderFlow {
    const flow = this.flows.find((f) => f.id === id);
    if (!flow) throw new OAuthError('oauth_unknown_provider');
    return flow;
  }

  isConfigured(id: OAuthProviderId): boolean {
    return this.provider(id).configured(this.config.config());
  }

  /**
   * Resolves `'left-page'` when the browser is being redirected — the session will be completed
   * by the callback page — and `'signed-in'` when a popup flow completed it here.
   */
  async start(id: OAuthProviderId, next = '/hub'): Promise<'left-page' | 'signed-in'> {
    const flow = this.provider(id);
    const config = this.config.config();
    if (!flow.configured(config)) throw new OAuthError('oauth_not_configured');
    const state = randomString(16);
    writeJson(
      STORAGE_KEYS.oauthState,
      { provider: id, state, next } satisfies PendingOAuth,
      sessionStorage,
    );
    const ctx: OAuthStartContext = {
      config,
      state,
      pkceChallenge: () => {
        const verifier = randomString(48);
        writeJson(STORAGE_KEYS.pkceVerifier, verifier, sessionStorage);
        return pkceChallenge(verifier);
      },
      popup: (url) => {
        const popup = window.open(url, 'naucto-oauth', 'width=520,height=640');
        if (!popup) throw new OAuthError('popup_blocked');
        return awaitPopup(popup);
      },
    };
    const started = await flow.start(ctx);
    if (started === 'left-page') return 'left-page';
    await this.auth.completeOAuth(started.token);
    return 'signed-in';
  }

  /** Forgets a flow that left and never came back, so no later callback can match its state. */
  abandon(): void {
    remove(STORAGE_KEYS.oauthState, sessionStorage);
    remove(STORAGE_KEYS.pkceVerifier, sessionStorage);
  }

  /** Validates state and returns where to go next; throws on mismatch. */
  consume(provider: OAuthProviderId, state: string | null): PendingOAuth {
    const pending = readJson<PendingOAuth | null>(STORAGE_KEYS.oauthState, null, sessionStorage);
    remove(STORAGE_KEYS.oauthState, sessionStorage);
    if (pending?.provider !== provider || pending.state !== state)
      throw new OAuthError('oauth_state_mismatch');
    return pending;
  }

  private takeVerifier(): string {
    const v = readJson<string>(STORAGE_KEYS.pkceVerifier, '', sessionStorage);
    remove(STORAGE_KEYS.pkceVerifier, sessionStorage);
    if (!v) throw new OAuthError('oauth_verifier_missing');
    return v;
  }

  /** On the callback page: this app's access token for the code the provider sent back. */
  finish(id: OAuthProviderId, code: string): Promise<string> {
    return this.provider(id).finish({
      config: this.config.config(),
      code,
      verifier: () => this.takeVerifier(),
    });
  }

  /** On a popup's callback page: gives the outcome to the page that opened it. */
  handBack(result: OAuthHandBack): void {
    const message: PopupMessage =
      'token' in result
        ? { type: 'naucto:oauth:success', token: result.token }
        : { type: 'naucto:oauth:error', error: result.error };
    (window.opener as Window | null)?.postMessage(message, location.origin);
  }
}
