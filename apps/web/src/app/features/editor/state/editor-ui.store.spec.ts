import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { installMemoryStorage } from '../../../testing/memory-storage';
import { EDITOR_MIN_WIDTH, EditorUiStore, REFERENCE_SPLIT_BREAKPOINT } from './editor-ui.store';

describe('EditorUiStore', () => {
  const store = (): InstanceType<typeof EditorUiStore> =>
    TestBed.configureTestingModule({ providers: [EditorUiStore] }).inject(EditorUiStore);

  // The store now reads storage when it is made, so what one test writes must not reach the next.
  beforeEach(() => {
    installMemoryStorage();
    TestBed.resetTestingModule();
  });

  /**
   * The whole point of artboard 1c: the running game is not evicted to make room for the
   * reference unless the window genuinely cannot hold both.
   */
  it('holds the editor back when the window is too narrow to lay it out', () => {
    const ui = store();
    ui.setViewportWidth(EDITOR_MIN_WIDTH);
    expect(ui.tooNarrow()).toBe(false);
    ui.setViewportWidth(EDITOR_MIN_WIDTH - 1);
    expect(ui.tooNarrow()).toBe(true);
  });

  it('puts the reference beside the console when there is room, and in its place when there is not', () => {
    const ui = store();
    ui.setTab('code');

    expect(ui.columnMode()).toBe('screen');

    ui.setReferenceOpen(true);
    ui.setViewportWidth(REFERENCE_SPLIT_BREAKPOINT);
    expect(ui.columnMode()).toBe('split');

    ui.setViewportWidth(REFERENCE_SPLIT_BREAKPOINT - 1);
    expect(ui.columnMode()).toBe('swap');

    // Closing it hands the width back whatever the window is doing.
    ui.setReferenceOpen(false);
    expect(ui.columnMode()).toBe('screen');
    ui.setViewportWidth(2560);
    expect(ui.columnMode()).toBe('screen');
  });

  it('holds the reference open across a resize rather than forgetting it', () => {
    const ui = store();
    ui.setTab('code');

    ui.setReferenceOpen(true);
    ui.setViewportWidth(1280);
    expect(ui.columnMode()).toBe('swap');

    ui.setViewportWidth(1920);
    expect(ui.columnMode()).toBe('split');
  });

  it('toggles', () => {
    const ui = store();
    ui.toggleReference();
    expect(ui.referenceOpen()).toBe(true);
    ui.toggleReference();
    expect(ui.referenceOpen()).toBe(false);
  });

  it('shows the reference on CODE only, and remembers it was asked for', () => {
    const ui = store();
    ui.setTab('code');
    ui.setReferenceOpen(true);
    expect(ui.referenceShown()).toBe(true);

    for (const tab of ['game', 'art', 'map', 'sound', 'net'] as const) {
      ui.setTab(tab);
      expect(ui.referenceShown()).toBe(false);
      expect(ui.columnMode()).toBe('screen');
    }

    ui.setTab('code');
    expect(ui.referenceShown()).toBe(true);
  });
});

describe('EditorUiStore and the Settings › Editor preferences', () => {
  it('starts a session with auto-run as Settings left it', () => {
    installMemoryStorage();
    localStorage.setItem('naucto.editor', JSON.stringify({ autoRun: false }));
    TestBed.resetTestingModule();
    const ui = TestBed.configureTestingModule({ providers: [EditorUiStore] }).inject(EditorUiStore);
    expect(ui.autoRun()).toBe(false);
  });
});
