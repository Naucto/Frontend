import { EnvironmentInjector, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LOCAL_ORIGIN } from '@naucto/engine';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { EditorModeService } from './editor-mode.service';
import { injectUndo } from './undo-scope';

/** The gate a game would be, open. */
const open = (doc: Y.Doc, change: () => void): boolean => {
  doc.transact(change, LOCAL_ORIGIN);
  return true;
};

describe('injectUndo with a limit', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [EditorModeService] });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('keeps the latest steps only, and lets the document drop what the older ones held', () => {
    const doc = new Y.Doc();
    const map = doc.getMap<string>('songs');
    const undo = runInInjectionContext(TestBed.inject(EnvironmentInjector), () =>
      injectUndo([map], { limit: { steps: 10, transact: (change) => open(doc, change) } }),
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
