import { computed, Injectable, signal } from '@angular/core';
import { readJson, STORAGE_KEYS, writeJson } from '@app/core/storage/local-storage';

interface PadSettings {
  /** Percentage of the pad's natural size, 60–140. */
  size: number;
  /** Percentage opacity of the landscape overlay, 30–100. */
  opacity: number;
}

const DEFAULTS: PadSettings = { size: 100, opacity: 85 };
const clamp = (n: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, Math.round(n)));

/**
 * How big and how solid the on-screen pad is.
 *
 * Thumbs differ, and so do hands: a pad sized for one person covers the game for another. Kept
 * per device rather than per account — it is a property of the hardware in your hands, and it has
 * to be right before the first frame, with no round trip.
 */
@Injectable({ providedIn: 'root' })
export class PadSettingsStore {
  private readonly state = signal<PadSettings>(readJson(STORAGE_KEYS.padLayout, DEFAULTS));

  readonly size = computed(() => this.state().size);
  readonly opacity = computed(() => this.state().opacity);
  /** What the pad multiplies its key sizes by. */
  readonly scale = computed(() => this.state().size / 100);
  readonly isDefault = computed(
    () => this.size() === DEFAULTS.size && this.opacity() === DEFAULTS.opacity,
  );

  setSize(size: number): void {
    this.patch({ size: clamp(size, 60, 140) });
  }

  setOpacity(opacity: number): void {
    this.patch({ opacity: clamp(opacity, 30, 100) });
  }

  reset(): void {
    this.patch(DEFAULTS);
  }

  private patch(next: Partial<PadSettings>): void {
    const merged = { ...this.state(), ...next };
    this.state.set(merged);
    writeJson(STORAGE_KEYS.padLayout, merged);
  }
}
