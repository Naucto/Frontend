import { EnvironmentInjector, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LOCAL_ORIGIN } from '@naucto/engine';
import { afterEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { injectUndo } from './undo-scope';

describe('injectUndo with a limit', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('keeps the latest steps only, and lets the document drop what the older ones held', () => {
    const doc = new Y.Doc();
    const map = doc.getMap<string>('songs');
    const undo = runInInjectionContext(TestBed.inject(EnvironmentInjector), () =>
      injectUndo([map], { limit: 10 }),
    );
    undo.manager.captureTimeout = 0;
    const value = 'x'.repeat(1000);
    for (let k = 0; k < 200; k++) {
      doc.transact(() => {
        map.set('0', `${value}${String(k)}`);
      }, LOCAL_ORIGIN);
    }

    expect(undo.manager.undoStack).toHaveLength(10);
    expect(Y.encodeStateAsUpdate(doc).length).toBeLessThan(20_000);

    let undone = 0;
    while (undo.manager.canUndo()) {
      undo.manager.undo();
      undone += 1;
    }
    expect(undone).toBe(10);
    expect(map.get('0')).toBe(`${value}189`);
  });

  it('keeps every step without one', () => {
    const doc = new Y.Doc();
    const map = doc.getMap<string>('songs');
    const undo = runInInjectionContext(TestBed.inject(EnvironmentInjector), () =>
      injectUndo([map]),
    );
    undo.manager.captureTimeout = 0;
    for (let k = 0; k < 50; k++) {
      doc.transact(() => {
        map.set('0', String(k));
      }, LOCAL_ORIGIN);
    }
    expect(undo.manager.undoStack).toHaveLength(50);
  });
});
