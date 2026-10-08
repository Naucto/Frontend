import { computed, Injectable, signal } from '@angular/core';
import { featuresControllerGetFeatures, type FeaturesResponseDto } from '@naucto/api-client';

import { unwrap } from '../api/api-errors';

/** Every flag is false until the server says otherwise. */
const OFF: FeaturesResponseDto = { monetization: false, analytics: false };

/**
 * Read once at boot and awaited, so a section that is switched off never renders and then vanishes.
 * A server that cannot answer leaves every flag off.
 */
@Injectable({ providedIn: 'root' })
export class FeaturesService {
  private readonly flags = signal<FeaturesResponseDto>(OFF);
  readonly monetization = computed(() => this.flags().monetization);
  readonly analytics = computed(() => this.flags().analytics);

  async load(): Promise<void> {
    try {
      const data = unwrap(await featuresControllerGetFeatures());
      this.flags.set({ monetization: data.monetization, analytics: data.analytics });
    } catch {
      this.flags.set(OFF);
    }
  }
}
