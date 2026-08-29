import {
  type EnvironmentProviders,
  inject,
  makeEnvironmentProviders,
  provideAppInitializer,
} from '@angular/core';
import { client } from '@naucto/api-client';

import { AuthStore } from '../auth/auth.store';
import { AppConfigService } from '../config/app-config';

const RETRIED = new WeakSet<Request>();

/**
 * Configures the generated fetch client: base URL from runtime config, cookies
 * for the refresh endpoint, bearer header from the in-memory token, and a
 * single-flight 401 → refresh → retry-once interceptor.
 */
export function provideApiClient(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideAppInitializer(async () => {
      const config = inject(AppConfigService);
      const auth = inject(AuthStore);
      // One ordered boot: runtime config → client → session. Initializers otherwise run concurrently.
      await config.load();
      client.setConfig({
        baseUrl: config.config().apiUrl,
        credentials: 'include',
        throwOnError: false,
      });

      client.interceptors.request.use((request: Request) => {
        const token = auth.accessToken();
        if (token && !request.headers.has('Authorization'))
          request.headers.set('Authorization', `Bearer ${token}`);
        return request;
      });

      client.interceptors.response.use(async (response: Response, request: Request) => {
        if (response.status !== 401 || request.url.includes('/auth/') || RETRIED.has(request))
          return response;
        if (!auth.accessToken()) return response;
        const token = await auth.refresh();
        if (!token) return response;
        const retry = new Request(request, { headers: new Headers(request.headers) });
        retry.headers.set('Authorization', `Bearer ${token}`);
        RETRIED.add(retry);
        return fetch(retry);
      });

      await auth.bootstrap();
    }),
  ]);
}
