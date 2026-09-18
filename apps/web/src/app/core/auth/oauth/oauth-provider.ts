import { type BrandName } from '@naucto/ui';

import { type AppConfig } from '../../config/app-config';

export type OAuthProviderId = 'google' | 'github' | 'microsoft';

export type OAuthErrorCode =
  | 'oauth_not_configured'
  | 'oauth_unknown_provider'
  | 'oauth_state_mismatch'
  | 'oauth_verifier_missing'
  | 'popup_blocked';

/** A failure this app can name, as a code rather than a sentence, so nothing shows a provider's prose. */
export class OAuthError extends Error {
  constructor(readonly code: OAuthErrorCode) {
    super(code);
    this.name = 'OAuthError';
  }
}

/** What a flow gets to send the browser off with. */
export interface OAuthStartContext {
  readonly config: AppConfig;
  /** Echoed back by the provider; `consume` refuses a callback that carries any other. */
  readonly state: string;
  /** Mints and stores a PKCE verifier, so `OAuthFinishContext.verifier` can hand it back later. */
  readonly pkceChallenge: () => Promise<string>;
  /** Opens the provider in a popup and resolves with the access token its callback posts back. */
  readonly popup: (url: string) => Promise<string>;
}

/** What a flow gets on the callback page, to turn the provider's code into a session. */
export interface OAuthFinishContext {
  readonly config: AppConfig;
  readonly code: string;
  /** The verifier `pkceChallenge` stored, taken once; throws when there is none. */
  readonly verifier: () => string;
}

/**
 * One way of signing in with someone else's account.
 *
 * A `redirect` flow replaces the page and comes back to the callback route with the whole app; a
 * `popup` flow keeps the page and gets its token posted back from the popup's callback. Everything
 * the provider's own protocol needs — URLs, scopes, which end exchanges the code — stays in the
 * flow; the service only stores state, opens windows and completes the session.
 */
export interface OAuthProviderFlow {
  readonly id: OAuthProviderId;
  /** Button caption: the brand's own name, which is not translated. */
  readonly label: string;
  readonly mark: BrandName;
  readonly kind: 'redirect' | 'popup';
  /** Whether the server this build runs on registered a client with the provider. */
  configured(config: AppConfig): boolean;
  /** Resolves with `'left-page'` once the browser is on its way, or with the token a popup returned. */
  start(ctx: OAuthStartContext): Promise<'left-page' | { token: string }>;
  /** Resolves with this app's access token for the code the provider sent back. */
  finish(ctx: OAuthFinishContext): Promise<string>;
}
