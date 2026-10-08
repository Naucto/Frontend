import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { PadSettingsStore } from './pad-settings.store';

/** The runner has no DOM storage; the store's whole point is that it survives one. */
function installMemoryStorage(): void {
  const mem = new Map<string, string>();
  const fake: Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'clear'> = {
    getItem: (key) => mem.get(key) ?? null,
    setItem: (key, value) => {
      mem.set(key, value);
    },
    removeItem: (key) => {
      mem.delete(key);
    },
    clear: () => {
      mem.clear();
    },
  };
  (globalThis as { localStorage?: unknown }).localStorage = fake;
}

describe('PadSettingsStore', () => {
  const store = (): PadSettingsStore => TestBed.inject(PadSettingsStore);

  beforeEach(() => {
    installMemoryStorage();
    TestBed.resetTestingModule();
  });

  it('starts at the default the pad is drawn for', () => {
    const settings = store();
    expect(settings.size()).toBe(100);
    expect(settings.scale()).toBe(1);
    expect(settings.isDefault()).toBe(true);
  });

  it('clamps to sizes a thumb can still hit', () => {
    const settings = store();
    settings.setSize(1000);
    expect(settings.size()).toBe(140);
    settings.setSize(0);
    expect(settings.size()).toBe(60);
    settings.setOpacity(1000);
    expect(settings.opacity()).toBe(100);
    settings.setOpacity(0);
    expect(settings.opacity()).toBe(30);
  });

  it('survives a reload, because it describes the hardware in your hands', () => {
    store().setSize(130);
    TestBed.resetTestingModule();
    expect(store().size()).toBe(130);
  });

  it('resets', () => {
    const settings = store();
    settings.setSize(130);
    settings.setOpacity(40);
    expect(settings.isDefault()).toBe(false);
    settings.reset();
    expect(settings.isDefault()).toBe(true);
  });
});
