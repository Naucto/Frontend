import { Injectable, signal } from '@angular/core';

/** Runtime configuration served as /config.json (written by the nginx entrypoint in production). */
export interface AppConfig {
  apiUrl: string;
  google: { clientId: string; redirectUri: string };
  github: { clientId: string; redirectUri: string };
  microsoft: { clientId: string; tenantId: string; redirectUri: string };
}

const FALLBACK: AppConfig = {
  apiUrl: '',
  google: { clientId: '', redirectUri: '' },
  github: { clientId: '', redirectUri: '' },
  microsoft: { clientId: '', tenantId: 'common', redirectUri: '' },
};

@Injectable({ providedIn: 'root' })
export class AppConfigService {
  private readonly state = signal<AppConfig>(FALLBACK);
  private loading: Promise<void> | null = null;
  readonly config = this.state.asReadonly();

  /** Fetches /config.json once; later callers await the same promise. */
  load(): Promise<void> {
    this.loading ??= this.fetchConfig();
    return this.loading;
  }

  private async fetchConfig(): Promise<void> {
    try {
      const res = await fetch('/config.json', { cache: 'no-store' });
      if (!res.ok) {
        return;
      }
      const raw = (await res.json()) as Partial<AppConfig>;
      this.state.set({
        ...FALLBACK,
        ...raw,
        google: { ...FALLBACK.google, ...raw.google },
        github: { ...FALLBACK.github, ...raw.github },
        microsoft: { ...FALLBACK.microsoft, ...raw.microsoft },
        apiUrl: (raw.apiUrl ?? '').replace(/\/$/, ''),
      });
    } catch {
      this.state.set(FALLBACK);
    }
  }

  /** Rewrites localhost hosts to the page host so LAN devices can reach the backend in dev. */
  reachable(url: string): string {
    try {
      const parsed = new URL(url, location.origin);
      if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
        parsed.hostname = location.hostname;
      }
      return parsed.toString();
    } catch {
      return url;
    }
  }
}
