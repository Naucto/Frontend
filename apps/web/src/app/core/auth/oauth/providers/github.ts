import { authControllerLoginWithGithub } from '@naucto/api-client';

import { unwrap } from '../../../api/api-errors';
import { type OAuthProviderFlow } from '../oauth-provider';

/** GitHub has no PKCE for OAuth apps: the state is the only thing the callback proves. */
export const github: OAuthProviderFlow = {
  id: 'github',
  label: 'GitHub',
  // Single-colour, so it inherits the button's ink.
  mark: {
    grid: [10, 8],
    rects: [
      [1, 0, 2, 1, 'currentColor'],
      [7, 0, 2, 1, 'currentColor'],
      [1, 1, 8, 1, 'currentColor'],
      [0, 2, 10, 1, 'currentColor'],
      [0, 3, 2, 1, 'currentColor'],
      [4, 3, 2, 1, 'currentColor'],
      [8, 3, 2, 1, 'currentColor'],
      [0, 4, 10, 1, 'currentColor'],
      [1, 5, 8, 1, 'currentColor'],
      [2, 6, 6, 1, 'currentColor'],
      [4, 7, 2, 1, 'currentColor'],
    ],
  },
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
