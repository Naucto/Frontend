import { FullscreenOverlayContainer, OverlayContainer } from '@angular/cdk/overlay';
import { provideHttpClient } from '@angular/common/http';
import {
  type ApplicationConfig,
  ErrorHandler,
  Injectable,
  isDevMode,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import {
  type ActivatedRouteSnapshot,
  BaseRouteReuseStrategy,
  provideRouter,
  RouteReuseStrategy,
  withComponentInputBinding,
  withInMemoryScrolling,
} from '@angular/router';
import { provideTransloco } from '@jsverse/transloco';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';

import { routes } from './app.routes';
import { provideApiClient } from './core/api/api-client.provider';
import { GlobalErrorHandler } from './core/errors/global-error-handler';
import { TranslocoHttpLoader } from './core/i18n/transloco-loader';

/** The editor owns one work session per instance, so another project id builds another editor. */
@Injectable()
export class ProjectRouteReuseStrategy extends BaseRouteReuseStrategy {
  override shouldReuseRoute(future: ActivatedRouteSnapshot, curr: ActivatedRouteSnapshot): boolean {
    if (
      future.routeConfig?.path === 'edit/:id' &&
      future.paramMap.get('id') !== curr.paramMap.get('id')
    ) {
      return false;
    }
    return super.shouldReuseRoute(future, curr);
  }
}

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
    { provide: RouteReuseStrategy, useClass: ProjectRouteReuseStrategy },
    provideTransloco({
      config: {
        availableLangs: ['en'],
        defaultLang: 'en',
        fallbackLang: 'en',
        reRenderOnLangChange: false,
        // In prod mode Transloco's missing-key handler returns the key without logging; a dev build
        // should log it.
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
    provideApiClient(),
  ],
};
