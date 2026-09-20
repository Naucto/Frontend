import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { type Translation, type TranslocoLoader } from '@jsverse/transloco';
import { ENGINE_VERSION } from '@naucto/engine/version';
import type { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class TranslocoHttpLoader implements TranslocoLoader {
  private readonly http = inject(HttpClient);

  /**
   * The version is in the URL because the catalogue's name is not.
   *
   * Production served this file as immutable for a year, so a browser that had loaded the site once
   * never asked for it again: every string added afterwards was painted as the name of its own key,
   * on a build that was otherwise current. The header is fixed now, but a browser already holding
   * that promise will not revalidate to hear about it -- only a URL it has never seen gets it out.
   */
  getTranslation(lang: string): Observable<Translation> {
    return this.http.get<Translation>(`/i18n/${lang}.json?v=${ENGINE_VERSION}`);
  }
}
