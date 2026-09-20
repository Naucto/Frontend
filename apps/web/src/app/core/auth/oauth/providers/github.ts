import { authControllerLoginWithGithub } from '@naucto/api-client';

import { unwrap } from '../../../api/api-errors';
import { type OAuthProviderFlow } from '../oauth-provider';

/** GitHub has no PKCE for OAuth apps: the state is the only thing the callback proves. */
export const github: OAuthProviderFlow = {
  id: 'github',
  label: 'GitHub',
  mark: 'github',
  kind: 'redirect',
  configured: ({ github: cfg }) => cfg.clientId !== '' && cfg.redirectUri !== '',
  start({ config: { github: cfg }, state }) {
    const url = new URL('https://github.com/login/oauth/authorize');
    url.searchParams.set('client_id', cfg.clientId);
    url.searchParams.set('redirect_uri', cfg.redirectUri);
    url.searchParams.set('scope', 'user:email');
    url.searchParams.set('state', state);
    location.assign(url.toString());
    return Promise.resolve('left-page');
  },
  async finish({ code }) {
    const res = unwrap(
      await authControllerLoginWithGithub({ body: { code }, credentials: 'include' }),
    );
    return res.access_token;
  },
};
