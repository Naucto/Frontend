import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { type Translation, type TranslocoLoader } from '@jsverse/transloco';
import { ENGINE_VERSION } from '@naucto/engine/version';
import type { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class TranslocoHttpLoader implements TranslocoLoader {
  private readonly http = inject(HttpClient);

  /**
   * The version is in the URL because the catalogue's file name carries no hash: a browser holding
   * a cached copy only refetches a URL it has never seen.
   */
  getTranslation(lang: string): Observable<Translation> {
    return this.http.get<Translation>(`/i18n/${lang}.json?v=${ENGINE_VERSION}`);
  }
}
