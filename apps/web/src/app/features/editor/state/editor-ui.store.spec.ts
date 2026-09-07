import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { EditorUiStore, REFERENCE_SPLIT_BREAKPOINT } from './editor-ui.store';

describe('EditorUiStore', () => {
  const store = (): InstanceType<typeof EditorUiStore> =>
    TestBed.configureTestingModule({ providers: [EditorUiStore] }).inject(EditorUiStore);

  /**
   * The whole point of artboard 1c: the running game is not evicted to make room for the
   * reference unless the window genuinely cannot hold both.
   */
  it('puts the reference beside the console when there is room, and in its place when there is not', () => {
    const ui = store();

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
});
