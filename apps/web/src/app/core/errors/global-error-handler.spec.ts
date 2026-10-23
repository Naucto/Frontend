import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ToastService } from '@naucto/ui';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { testProviders } from '../../testing/providers';
import { ApiError } from '../api/api-errors';
import { FeaturesService } from '../config/features.service';
import { CrashReporter } from '../crash/crash-reporter.service';
import { GlobalErrorHandler, SHOW_CRASHES } from './global-error-handler';

describe('GlobalErrorHandler', () => {
  const show = vi.fn();
  const report = vi.fn();

  const handler = (showCrashes: boolean): GlobalErrorHandler => {
    TestBed.configureTestingModule({
      providers: [
        ...testProviders(),
        GlobalErrorHandler,
        { provide: ToastService, useValue: { show } },
        { provide: CrashReporter, useValue: { report } },
        { provide: FeaturesService, useValue: { feedback: signal(true) } },
        { provide: SHOW_CRASHES, useValue: showCrashes },
      ],
    });
    return TestBed.inject(GlobalErrorHandler);
  };

  beforeEach(() => {
    TestBed.resetTestingModule();
    show.mockReset();
    report.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('reports a crash without saying it on screen in a production build', () => {
    handler(false).handleError(new TypeError('boom'));

    expect(report).toHaveBeenCalledWith('web', expect.any(TypeError));
    expect(show).not.toHaveBeenCalled();
  });

  it('reports a crash and offers a bug report on screen in a development build', () => {
    handler(true).handleError(new TypeError('boom'));

    expect(report).toHaveBeenCalledTimes(1);
    expect(show).toHaveBeenCalledWith(
      'boom',
      'error',
      expect.any(Number),
      expect.objectContaining({ run: expect.any(Function) }),
    );
  });

  it('still says a failed request, which the reader can act on, and reports nothing', () => {
    handler(false).handleError(new ApiError(500, 'The server could not save'));

    expect(show).toHaveBeenCalledWith('The server could not save', 'error');
    expect(report).not.toHaveBeenCalled();
  });
});
