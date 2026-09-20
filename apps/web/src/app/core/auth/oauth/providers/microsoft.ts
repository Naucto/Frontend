import { authControllerLoginWithMicrosoft } from '@naucto/api-client';

import { unwrap } from '../../../api/api-errors';
import { type OAuthProviderFlow } from '../oauth-provider';

const SCOPE = 'openid email profile';

/**
 * Registered with Microsoft as a single-page app, so the code is exchanged here, in the popup's
 * callback, and only the resulting id_token goes to our backend.
 */
export const microsoft: OAuthProviderFlow = {
  id: 'microsoft',
  label: 'Microsoft',
  mark: 'microsoft',
  kind: 'popup',
  configured: ({ microsoft: cfg }) => cfg.clientId !== '' && cfg.redirectUri !== '',
  async start({ config: { microsoft: cfg }, state, pkceChallenge, popup }) {
    const url = new URL(`https://login.microsoftonline.com/${cfg.tenantId}/oauth2/v2.0/authorize`);
    url.searchParams.set('client_id', cfg.clientId);
    url.searchParams.set('redirect_uri', cfg.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', SCOPE);
    url.searchParams.set('code_challenge', await pkceChallenge());
    url.searchParams.set('code_challenge_method', 'S256');
    url.searchParams.set('state', state);
    url.searchParams.set('prompt', 'select_account');
    return { token: await popup(url.toString()) };
  },
  async finish({ config: { microsoft: cfg }, code, verifier }) {
    const body = new URLSearchParams({
      client_id: cfg.clientId,
      grant_type: 'authorization_code',
      code,
      redirect_uri: cfg.redirectUri,
      code_verifier: verifier(),
      scope: SCOPE,
    });
    const tokenRes = await fetch(
      `https://login.microsoftonline.com/${cfg.tenantId}/oauth2/v2.0/token`,
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
  },
};
