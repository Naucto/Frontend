import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { installMemoryStorage } from '../../../testing/memory-storage';
import { SoundStore } from './sound.store';

describe('SoundStore', () => {
  const store = (): InstanceType<typeof SoundStore> =>
    TestBed.configureTestingModule({ providers: [SoundStore] }).inject(SoundStore);

  beforeEach(installMemoryStorage);

  afterEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('opens on a step of snap unless Settings turned snapping off', () => {
    expect(store().snap()).toBe(16);
    TestBed.resetTestingModule();

    localStorage.setItem('naucto.editor', JSON.stringify({ soundSnap: false }));
    expect(store().snap()).toBe(0);
  });
});
