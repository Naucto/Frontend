import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AnalyticsTransport } from '../analytics/analytics-transport';
import { CRASHES_PER_TAB, CrashReporter } from './crash-reporter.service';

describe('CrashReporter', () => {
  const post = vi.fn();

  const reporter = (): CrashReporter => TestBed.inject(CrashReporter);

  beforeEach(() => {
    TestBed.resetTestingModule();
    post.mockReset().mockResolvedValue(null);
    TestBed.configureTestingModule({
      providers: [{ provide: AnalyticsTransport, useValue: { post } }],
    });
  });

  it('sends a crash once, anonymously, with the page and the release it happened in', () => {
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
        route: '/',
        appRelease: 'dev',
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

  it('never throws when the report itself cannot leave', async () => {
    post.mockRejectedValue(new Error('offline'));

    expect(() => {
      reporter().report('web', new Error('boom'));
    }).not.toThrow();
    await Promise.resolve();
  });
});
