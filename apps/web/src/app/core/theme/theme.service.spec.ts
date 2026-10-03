import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { installMemoryStorage } from '../../testing/memory-storage';
import { ThemeService } from './theme.service';

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
