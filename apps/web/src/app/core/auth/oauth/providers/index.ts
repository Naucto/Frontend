import { InjectionToken } from '@angular/core';

import { type OAuthProviderFlow } from '../oauth-provider';
import { github } from './github';
import { google } from './google';
import { microsoft } from './microsoft';

/** Every flow this app offers, in the order the design draws their buttons. */
export const OAUTH_PROVIDERS = new InjectionToken<readonly OAuthProviderFlow[]>('OAUTH_PROVIDERS', {
  providedIn: 'root',
  factory: () => [google, github, microsoft],
});
