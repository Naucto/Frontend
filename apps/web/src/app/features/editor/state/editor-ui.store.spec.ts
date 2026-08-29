import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { EditorUiStore } from './editor-ui.store';

describe('EditorUiStore', () => {
  const store = (): InstanceType<typeof EditorUiStore> =>
    TestBed.configureTestingModule({ providers: [EditorUiStore] }).inject(EditorUiStore);

  it('keeps the console beside CODE and gives the other tabs their full width', () => {
    const ui = store();

    ui.setTab('code');
    expect(ui.collapsed()).toBe(false);

    for (const tab of ['game', 'art', 'map', 'sound', 'net'] as const) {
      ui.setTab(tab);
      expect(ui.collapsed()).toBe(true);
    }
  });

  it('remembers the reader’s own choice per tab', () => {
    const ui = store();

    ui.setTab('art');
    ui.toggleCollapsed();
    expect(ui.collapsed()).toBe(false);

    // The override is per tab: MAP is untouched, so it still follows the default.
    ui.setTab('map');
    expect(ui.collapsed()).toBe(true);

    ui.setTab('art');
    expect(ui.collapsed()).toBe(false);
  });
});
