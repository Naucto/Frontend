import { authControllerLoginWithGoogleCode } from '@naucto/api-client';

import { unwrap } from '../../../api/api-errors';
import { type OAuthProviderFlow } from '../oauth-provider';

export const google: OAuthProviderFlow = {
  id: 'google',
  label: 'Google',
  mark: 'google',
  kind: 'redirect',
  configured: ({ google: cfg }) => cfg.clientId !== '' && cfg.redirectUri !== '',
  async start({ config: { google: cfg }, state, pkceChallenge }) {
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', cfg.clientId);
    url.searchParams.set('redirect_uri', cfg.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid email profile');
    url.searchParams.set('code_challenge', await pkceChallenge());
    url.searchParams.set('code_challenge_method', 'S256');
    url.searchParams.set('state', state);
    location.assign(url.toString());
    return 'left-page';
  },
  async finish({ code, verifier }) {
    const res = unwrap(
      await authControllerLoginWithGoogleCode({
        body: { code, codeVerifier: verifier() },
        credentials: 'include',
      }),
    );
    return res.access_token;
  },
};
