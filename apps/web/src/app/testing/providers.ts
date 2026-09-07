import { type EnvironmentProviders, Injectable, type Provider } from '@angular/core';
import { provideRouter, type Routes } from '@angular/router';
import { provideTransloco, type Translation, type TranslocoLoader } from '@jsverse/transloco';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { type Observable, of } from 'rxjs';

import en from '../../../public/i18n/en.json';

@Injectable()
class InlineLoader implements TranslocoLoader {
  getTranslation(): Observable<Translation> {
    return of(en as Translation);
  }
}

/** Providers every component test needs: router, i18n (inline English), query client. */
export function testProviders(routes: Routes = []): (Provider | EnvironmentProviders)[] {
  return [
    provideRouter(routes),
    provideTransloco({
      config: {
        availableLangs: ['en'],
        defaultLang: 'en',
        prodMode: true,
        reRenderOnLangChange: false,
      },
      loader: InlineLoader,
    }),
    provideTanStackQuery(new QueryClient({ defaultOptions: { queries: { retry: false } } })),
  ];
}
