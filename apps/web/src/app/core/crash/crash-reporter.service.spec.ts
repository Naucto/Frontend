import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AnalyticsTransport } from '../analytics/analytics-transport';
import { AppConfigService } from '../config/app-config';
import { FeaturesService } from '../config/features.service';
import { CRASHES_PER_TAB, CrashReporter, crashRoute } from './crash-reporter.service';

describe('CrashReporter', () => {
  const post = vi.fn();
  const feedback = signal(true);

  const reporter = (): CrashReporter => TestBed.inject(CrashReporter);

  beforeEach(() => {
    TestBed.resetTestingModule();
    post.mockReset().mockResolvedValue(null);
    feedback.set(true);
    TestBed.configureTestingModule({
      providers: [
        { provide: AnalyticsTransport, useValue: { post } },
        { provide: FeaturesService, useValue: { feedback } },
        { provide: AppConfigService, useValue: { config: signal({ release: 'abc123' }) } },
      ],
    });
  });

  it('keeps only the path of a page, which is all the server takes', () => {
    expect(crashRoute('/play/42?code=secret#top')).toBe('/play/42');
    expect(crashRoute('/u/zoë')).toBe('/u/zo');
    expect(crashRoute('')).toBe('/');
  });

  it('sends a crash once, anonymously, with the release it happened in', () => {
    const error = new TypeError('x is undefined');

    reporter().report('web', error);
    reporter().report('web', error);

    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith(
      '/reports/crash',
      expect.objectContaining({
        source: 'web',
        name: 'TypeError',
        message: 'x is undefined',
        appRelease: 'abc123',
      }),
      { keepalive: true },
    );
  });

  it('stops after a handful of crashes in one tab', () => {
    for (let i = 0; i < CRASHES_PER_TAB + 5; i++) {
      reporter().report('engine', new Error(`fault ${String(i)}`));
    }

    expect(post).toHaveBeenCalledTimes(CRASHES_PER_TAB);
  });

  it('sends nothing while feedback is off', () => {
    feedback.set(false);

    reporter().report('web', new Error('boom'));

    expect(post).not.toHaveBeenCalled();
  });

  it('never throws when the report itself cannot leave', async () => {
    post.mockRejectedValue(new Error('offline'));

    expect(() => {
      reporter().report('web', new Error('boom'));
    }).not.toThrow();
    await Promise.resolve();
  });
});
