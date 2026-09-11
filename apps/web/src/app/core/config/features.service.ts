import { computed, Injectable, signal } from '@angular/core';
import { client } from '@naucto/api-client';

/** What this deployment is showing. Every flag is false until the server says otherwise. */
export interface Features {
  monetization: boolean;
}

const OFF: Features = { monetization: false };

/**
 * Read once at boot, before anything renders.
 *
 * A part of the product that is not being shown must not appear and then vanish, so this is
 * awaited rather than queried: a section that flickers in and out reads as a fault. A server that
 * cannot answer leaves every flag off, which is the same answer as a server that says no — the
 * safe one of the two, since the alternative is offering something the deployment cannot honour.
 */
@Injectable({ providedIn: 'root' })
export class FeaturesService {
  private readonly flags = signal<Features>(OFF);
  readonly monetization = computed(() => this.flags().monetization);

  async load(): Promise<void> {
    try {
      const res = await client.get<Features>({ url: '/features' });
      const data = res.data;
      this.flags.set({ monetization: data?.monetization === true });
    } catch {
      this.flags.set(OFF);
    }
  }
}
