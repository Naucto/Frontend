import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { ThemeService } from './theme.service';

/** The runner has no DOM storage, and the point of the preference is that it survives one. */
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

describe('ThemeService', () => {
  const service = (): ThemeService => TestBed.inject(ThemeService);

  beforeEach(() => {
    installMemoryStorage();
    TestBed.resetTestingModule();
    delete document.documentElement.dataset.noVeil;
  });

  it('leaves the screen effect on until someone turns it off', () => {
    expect(service().screenVeil()).toBe(true);
    TestBed.tick();
    expect(document.documentElement.dataset.noVeil).toBeUndefined();
  });

  it('marks the document when it is off, so both veils see one answer', () => {
    service().screenVeil.set(false);
    TestBed.tick();
    expect(document.documentElement.dataset.noVeil).toBe('');
  });

  it('survives a reload, because it describes how someone wants to be shown a screen', () => {
    service().screenVeil.set(false);
    TestBed.tick();
    TestBed.resetTestingModule();
    expect(service().screenVeil()).toBe(false);
  });
});
