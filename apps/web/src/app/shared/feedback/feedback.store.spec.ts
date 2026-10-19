import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { FeedbackStore, PROMPT_AFTER_BUILD_MS, PROMPT_AFTER_PLAY_MS } from './feedback.store';

describe('FeedbackStore', () => {
  const store = (): InstanceType<typeof FeedbackStore> => TestBed.inject(FeedbackStore);

  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('asks after a real play, not after a glance at a game', () => {
    store().notePlayEnded(42, PROMPT_AFTER_PLAY_MS - 1);
    expect(store().armed()).toBeNull();

    store().notePlayEnded(42, PROMPT_AFTER_PLAY_MS);
    expect(store().armed()).toEqual({ context: 'PLAYER', releaseId: 42 });
  });

  it('asks a creator after a real editing session', () => {
    store().noteEditorLeft(PROMPT_AFTER_BUILD_MS - 1);
    expect(store().armed()).toBeNull();

    store().noteEditorLeft(PROMPT_AFTER_BUILD_MS);
    expect(store().armed()).toEqual({ context: 'CREATOR', releaseId: null });

    store().disarm();
    expect(store().armed()).toBeNull();
  });
});
