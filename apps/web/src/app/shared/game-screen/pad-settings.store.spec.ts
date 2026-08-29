import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { PadSettingsStore } from './pad-settings.store';

/** The runner has no DOM storage; the store's whole point is that it survives one. */
function installMemoryStorage(): void {
  const mem = new Map<string, string>();
  const fake: Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'clear'> = {
    getItem: (k) => mem.get(k) ?? null,
    setItem: (k, v) => {
      mem.set(k, v);
    },
    removeItem: (k) => {
      mem.delete(k);
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
    const s = store();
    expect(s.size()).toBe(100);
    expect(s.scale()).toBe(1);
    expect(s.isDefault()).toBe(true);
  });

  it('clamps to sizes a thumb can still hit', () => {
    const s = store();
    s.setSize(1000);
    expect(s.size()).toBe(140);
    s.setSize(0);
    expect(s.size()).toBe(60);
    s.setOpacity(1000);
    expect(s.opacity()).toBe(100);
    s.setOpacity(0);
    expect(s.opacity()).toBe(30);
  });

  it('survives a reload, because it describes the hardware in your hands', () => {
    store().setSize(130);
    TestBed.resetTestingModule();
    expect(store().size()).toBe(130);
  });

  it('resets', () => {
    const s = store();
    s.setSize(130);
    s.setOpacity(40);
    expect(s.isDefault()).toBe(false);
    s.reset();
    expect(s.isDefault()).toBe(true);
  });
});
