import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { ActivityService } from './activity.service';

describe('ActivityService', () => {
  let activity: ActivityService;

  beforeEach(() => {
    TestBed.resetTestingModule();
    activity = TestBed.inject(ActivityService);
  });

  it('is browsing when nothing else is claimed', () => {
    expect(activity.current()).toEqual({ state: 'BROWSING' });
  });

  it('reports the highest claim, with its game', () => {
    const building = activity.claim({ state: 'BUILDING' });
    const playing = activity.claim({ state: 'PLAYING', releaseId: 4 });
    activity.claim({ state: 'BROWSING' });

    expect(activity.current()).toEqual({ state: 'PLAYING', releaseId: 4 });

    playing();
    expect(activity.current()).toEqual({ state: 'BUILDING' });

    building();
    expect(activity.current()).toEqual({ state: 'BROWSING' });
  });

  it('ranks hosting above playing', () => {
    activity.claim({ state: 'PLAYING', releaseId: 4 });
    activity.claim({ state: 'HOSTING', releaseId: 4 });

    expect(activity.current().state).toBe('HOSTING');
  });

  it('keeps an equal claim when another is released twice', () => {
    const first = activity.claim({ state: 'PLAYING', releaseId: 1 });
    activity.claim({ state: 'PLAYING', releaseId: 2 });

    first();
    first();

    expect(activity.current()).toEqual({ state: 'PLAYING', releaseId: 2 });
  });
});
