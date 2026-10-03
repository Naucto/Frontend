import { TestBed } from '@angular/core/testing';
import { testProviders } from '@app/testing/providers';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

import { installMemoryStorage } from '../../../testing/memory-storage';
import { EditorRuntimeService } from '../state/editor-runtime.service';
import { EditorUiStore } from '../state/editor-ui.store';
import { WorkSessionService } from '../work-session/work-session.service';
import { ConsoleColumnComponent } from './console-column.component';

describe('ConsoleColumnComponent', () => {
  const codeFiles = new Y.Doc().getMap<unknown>('codeFiles');

  beforeEach(() => {
    installMemoryStorage();
    codeFiles.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ConsoleColumnComponent],
      providers: [
        ...testProviders(),
        EditorRuntimeService,
        EditorUiStore,
        { provide: WorkSessionService, useValue: { game: { codeFiles } } },
      ],
    });
    // The column's own template brings the game screen with it; what is at stake here is the
    // subscription the constructor makes, not what the column draws.
    TestBed.overrideComponent(ConsoleColumnComponent, { set: { template: '' } });
  });

  /**
   * The debounce holds the column, the screen and through them the session's document. A keystroke
   * just before the tab is left must not leave one of those alive for the length of the delay.
   */
  it('cancels a pending auto-run reload when the column is destroyed', () => {
    vi.useFakeTimers();
    try {
      TestBed.inject(EditorUiStore).setAutoRun(true);
      const fixture = TestBed.createComponent(ConsoleColumnComponent);
      fixture.detectChanges();
      const before = vi.getTimerCount();

      codeFiles.set('main', 'print(1)');
      expect(vi.getTimerCount()).toBe(before + 1);

      fixture.destroy();
      expect(vi.getTimerCount()).toBe(before);
    } finally {
      vi.useRealTimers();
    }
  });
});
