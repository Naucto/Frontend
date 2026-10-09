import { Component, CUSTOM_ELEMENTS_SCHEMA, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { EngineState } from '@naucto/engine';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ActivityService } from '../../core/analytics/activity.service';
import { PlayReporter } from '../../core/analytics/play-reporter';
import { RuntimeHostService } from '../../shared/game-screen/runtime-host.service';
import { PlayTrackingDirective } from './play-tracking.directive';

const listeners = new Set<(state: EngineState) => void>();
const runtime = {
  onStateChange: (listener: (state: EngineState) => void): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
const emit = (state: EngineState): void => {
  for (const listener of listeners) {
    listener(state);
  }
};

@Component({
  imports: [PlayTrackingDirective],
  template: `
    @if (shown()) {
      <nc-game-screen [ncPlayTracking]="releaseId()" />
    }
  `,
  providers: [{ provide: RuntimeHostService, useValue: runtime }],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
class GamePage {
  readonly releaseId = signal(5);
  readonly shown = signal(true);
}

describe('PlayTrackingDirective', () => {
  const reporter = {
    begin: vi.fn(),
    end: vi.fn(),
    exit: vi.fn(),
    sync: vi.fn(),
    registerView: vi.fn(),
  };

  const mount = (): { page: GamePage; activity: ActivityService } => {
    const fixture = TestBed.createComponent(GamePage);
    fixture.detectChanges();
    return { page: fixture.componentInstance, activity: TestBed.inject(ActivityService) };
  };

  beforeEach(() => {
    listeners.clear();
    for (const mock of Object.values(reporter)) {
      mock.mockClear();
    }
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: PlayReporter, useValue: reporter }] });
  });

  it('reports a play, marks the tab as playing it, and counts one view', () => {
    const { activity } = mount();

    emit('running');
    expect(reporter.begin).toHaveBeenCalledWith(5, expect.anything());
    expect(activity.current()).toEqual({ state: 'PLAYING', releaseId: 5 });

    emit('idle');
    emit('running');
    expect(reporter.end).toHaveBeenCalledWith('stopped');
    expect(reporter.begin).toHaveBeenCalledTimes(2);
    expect(reporter.registerView).toHaveBeenCalledTimes(1);
  });

  it('ends the play when the page shows another game', () => {
    const { page, activity } = mount();
    emit('running');

    page.releaseId.set(6);
    TestBed.tick();

    expect(reporter.end).toHaveBeenCalledWith('release-change');
    expect(activity.current().state).toBe('BROWSING');
  });

  it('ends the play when the screen goes away', () => {
    const { page } = mount();
    emit('running');

    page.shown.set(false);
    TestBed.tick();

    expect(reporter.end).toHaveBeenCalledWith('leave');
    expect(listeners.size).toBe(0);
  });

  it('hands the play over as the page is hidden for good, and resumes it from the cache', () => {
    mount();
    emit('running');

    window.dispatchEvent(new Event('pagehide'));
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));

    expect(reporter.exit).toHaveBeenCalled();
    expect(reporter.sync).toHaveBeenCalled();
  });
});
