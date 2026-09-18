import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { EditorPrefsStore } from './editor-prefs.store';

/** The runner has no DOM storage, and the point of a preference is that it survives one. */
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

describe('EditorPrefsStore', () => {
  const store = (): InstanceType<typeof EditorPrefsStore> => TestBed.inject(EditorPrefsStore);

  beforeEach(() => {
    installMemoryStorage();
    TestBed.resetTestingModule();
  });

  it('holds a section open until told otherwise', () => {
    const prefs = store();
    expect(prefs.isOpen('art.palette')).toBe(true);
    prefs.setSectionOpen('art.palette', false);
    expect(prefs.isOpen('art.palette')).toBe(false);
    expect(prefs.isOpen('art.flags')).toBe(true);
  });

  it('remembers a fold across a restart, beside the other preferences', () => {
    const before = store();
    before.setSoundSnap(false);
    before.setSectionOpen('art.palette', false);

    TestBed.resetTestingModule();
    const after = store();
    expect(after.isOpen('art.palette')).toBe(false);
    expect(after.soundSnap()).toBe(false);
    expect(after.autoRun()).toBe(true);
  });
});
