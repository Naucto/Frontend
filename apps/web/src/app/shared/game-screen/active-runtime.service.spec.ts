import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { ActiveRuntimeService } from './active-runtime.service';
import type { RuntimeHostService } from './runtime-host.service';

describe('ActiveRuntimeService', () => {
  const editor = {} as RuntimeHostService;
  const rig = {} as RuntimeHostService;
  let active: ActiveRuntimeService;

  beforeEach(() => {
    TestBed.resetTestingModule();
    active = TestBed.inject(ActiveRuntimeService);
  });

  it('hands back to the editor runtime when the NET test rig is released', () => {
    active.claim(editor);
    active.claim(rig);
    expect(active.current()).toBe(rig);

    active.release(rig);
    expect(active.current()).toBe(editor);

    active.release(editor);
    expect(active.current()).toBeNull();
  });

  it('puts a runtime that claims again on top, without holding it twice', () => {
    active.claim(editor);
    active.claim(rig);
    active.claim(editor);
    expect(active.current()).toBe(editor);

    active.release(editor);
    expect(active.current()).toBe(rig);
  });
});
