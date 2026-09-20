import { FullscreenOverlayContainer, OverlayContainer } from '@angular/cdk/overlay';
import { provideHttpClient } from '@angular/common/http';
import {
  type ApplicationConfig,
  ErrorHandler,
  isDevMode,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { provideTransloco } from '@jsverse/transloco';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';

import { routes } from './app.routes';
import { provideApiClient } from './core/api/api-client.provider';
import { GlobalErrorHandler } from './core/errors/global-error-handler';
import { TranslocoHttpLoader } from './core/i18n/transloco-loader';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
    // A fullscreen element is the only thing the browser paints, and the default overlay container
    // sits outside this application's tree — so no overlay can be seen over anything fullscreen.
    { provide: OverlayContainer, useClass: FullscreenOverlayContainer },
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
        // Not a constant: on `true` Transloco's missing-key handler returns the key in silence, so
        // a key that never made it into the catalogue reads as a screaming SOME.DOTTED.NAME in the
        // UI and says nothing in the console. In dev it should complain.
        prodMode: !isDevMode(),
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
    // Boots config → api client → session in one ordered initializer.
    provideApiClient(),
  ],
};
