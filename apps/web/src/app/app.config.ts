import { provideHttpClient } from '@angular/common/http';
import {
  type ApplicationConfig,
  ErrorHandler,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { provideTransloco } from '@jsverse/transloco';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';

import { routes } from './app.routes';
import { provideApiClient } from './core/api/api-client.provider';
import { AuthStore } from './core/auth/auth.store';
import { AppConfigService } from './core/config/app-config';
import { GlobalErrorHandler } from './core/errors/global-error-handler';
import { TranslocoHttpLoader } from './core/i18n/transloco-loader';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
    provideHttpClient(),
    provideRouter(
      routes,
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled' }),
    ),
    provideTransloco({
      config: {
        availableLangs: ['en'],
        defaultLang: 'en',
        fallbackLang: 'en',
        reRenderOnLangChange: false,
        prodMode: true,
      },
      loader: TranslocoHttpLoader,
    }),
    provideTanStackQuery(
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: (count, err) =>
              count < 2 && ((err as unknown as { status?: number }).status ?? 0) >= 500,
          },
        },
      }),
    ),
    // Order matters: config → api client → auth bootstrap.
    provideAppInitializer(() => inject(AppConfigService).load()),
    provideApiClient(),
    provideAppInitializer(() => inject(AuthStore).bootstrap()),
  ],
};
