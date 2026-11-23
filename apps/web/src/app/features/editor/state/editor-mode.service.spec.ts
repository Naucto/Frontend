import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { type EditorMode, EditorModeService } from './editor-mode.service';

describe('EditorModeService', () => {
  let service: EditorModeService;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [EditorModeService] });
    service = TestBed.inject(EditorModeService);
  });

  it('writes until something says otherwise', () => {
    expect(service.mode()).toBe('normal');
    expect(service.canWrite()).toBe(true);
  });

  it.each<[EditorMode, boolean]>([
    ['normal', true],
    ['diff', false],
    ['read-only', false],
  ])('answers for the chosen mode %s that it writes: %s', (mode, writes) => {
    service.choose(mode);

    expect(service.mode()).toBe(mode);
    expect(service.canWrite()).toBe(writes);
  });

  it('closes writing in diff, imposed as well as chosen', () => {
    service.impose('diff');

    expect(service.mode()).toBe('diff');
    expect(service.canWrite()).toBe(false);
  });

  it('lets the imposed mode win over the one chosen, before or after it', () => {
    service.choose('diff');
    service.impose('read-only');
    expect(service.mode()).toBe('read-only');

    service.choose('normal');
    expect(service.mode()).toBe('read-only');
    expect(service.canWrite()).toBe(false);
  });

  it('keeps the first mode imposed: nothing switches it off or trades it for another', () => {
    service.impose('read-only');
    service.impose('diff');

    expect(service.mode()).toBe('read-only');
  });

  it('goes back to writing when a chosen mode is given up', () => {
    service.choose('read-only');
    service.choose('normal');

    expect(service.canWrite()).toBe(true);
  });
});
