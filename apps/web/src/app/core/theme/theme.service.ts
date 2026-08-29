import { computed, effect, Injectable, signal } from '@angular/core';

import { readJson, STORAGE_KEYS, writeJson } from '../storage/local-storage';

const readTheme = (): ThemePreference => {
  try {
    const v = localStorage.getItem(STORAGE_KEYS.theme);
    return v === 'dark' || v === 'light' ? v : 'system';
  } catch {
    return 'system';
  }
};

export type ThemePreference = 'dark' | 'light' | 'system';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<ThemePreference>(readTheme());
  readonly reduceMotion = signal<boolean>(readJson<boolean>(STORAGE_KEYS.reduceMotion, false));
  /** The FPS readout on every game screen, in the editor's viewer as much as on a game page. */
  readonly showFps = signal<boolean>(readJson<boolean>(STORAGE_KEYS.showFps, true));

  /** Tracks the OS preference so `effective` is right while the theme is `system`. */
  private readonly systemLight = signal(false);

  /**
   * The theme actually in force, `dark` or `light`.
   *
   * Canvases read their colours from CSS custom properties at paint time, so they must repaint when
   * this changes: read it inside the redraw effect and the flip is picked up for free.
   */
  readonly effective = computed<'dark' | 'light'>(() => {
    const t = this.theme();
    if (t !== 'system') return t;
    return this.systemLight() ? 'light' : 'dark';
  });

  constructor() {
    const media = window.matchMedia('(prefers-color-scheme: light)');
    this.systemLight.set(media.matches);
    media.addEventListener('change', (e) => {
      this.systemLight.set(e.matches);
    });
    effect(() => {
      const t = this.theme();
      const root = document.documentElement;
      if (t === 'system') delete root.dataset.theme;
      else root.dataset.theme = t;
      try {
        // Plain string: index.html reads it before Angular boots to avoid a theme flash.
        localStorage.setItem(STORAGE_KEYS.theme, t);
      } catch {
        /* ignore */
      }
    });
    effect(() => {
      const root = document.documentElement;
      const reduce =
        this.reduceMotion() || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduce) root.dataset.reduceMotion = '';
      else delete root.dataset.reduceMotion;
      writeJson(STORAGE_KEYS.reduceMotion, this.reduceMotion());
    });
    effect(() => {
      writeJson(STORAGE_KEYS.showFps, this.showFps());
    });
  }

  toggle(): void {
    this.theme.set(this.effective() === 'dark' ? 'light' : 'dark');
  }
}
