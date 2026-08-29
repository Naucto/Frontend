import { Injectable, signal } from '@angular/core';

/** Runtime configuration served as /config.json (written by the nginx entrypoint in production). */
export interface AppConfig {
  apiUrl: string;
  google: { clientId: string; redirectUri: string };
  github: { clientId: string; redirectUri: string };
  microsoft: { clientId: string; tenantId: string; redirectUri: string };
  docsEnabled: boolean;
}

const FALLBACK: AppConfig = {
  apiUrl: '',
  google: { clientId: '', redirectUri: '' },
  github: { clientId: '', redirectUri: '' },
  microsoft: { clientId: '', tenantId: 'common', redirectUri: '' },
  docsEnabled: true,
};

@Injectable({ providedIn: 'root' })
export class AppConfigService {
  private readonly state = signal<AppConfig>(FALLBACK);
  readonly config = this.state.asReadonly();

  async load(): Promise<void> {
    try {
      const res = await fetch('/config.json', { cache: 'no-store' });
      if (!res.ok) return;
      const raw = (await res.json()) as Partial<AppConfig>;
      this.state.set({
        ...FALLBACK,
        ...raw,
        google: { ...FALLBACK.google, ...raw.google },
        github: { ...FALLBACK.github, ...raw.github },
        microsoft: { ...FALLBACK.microsoft, ...raw.microsoft },
        apiUrl: resolveApiUrl(raw.apiUrl),
      });
    } catch {
      this.state.set({ ...FALLBACK, apiUrl: resolveApiUrl(undefined) });
    }
  }

  /** Rewrites localhost hosts to the page host so LAN devices can reach the backend in dev. */
  reachable(url: string): string {
    try {
      const u = new URL(url, location.origin);
      if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') u.hostname = location.hostname;
      return u.toString();
    } catch {
      return url;
    }
  }
}

function resolveApiUrl(configured: string | undefined): string {
  if (configured) return configured.replace(/\/$/, '');
  return '';
}
