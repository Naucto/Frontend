import { TestBed } from '@angular/core/testing';
import { ToastService } from '@naucto/ui';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../api/api-errors';
import { CrashReporter } from '../reports/crash-reporter.service';
import { GlobalErrorHandler } from './global-error-handler';

describe('GlobalErrorHandler', () => {
  const report = vi.fn();
  const show = vi.fn();
  const debug = vi.fn();

  const handler = (): GlobalErrorHandler => {
    TestBed.configureTestingModule({
      providers: [
        GlobalErrorHandler,
        { provide: CrashReporter, useValue: { report } },
        { provide: ToastService, useValue: { show, debug } },
      ],
    });
    return TestBed.inject(GlobalErrorHandler);
  };

  beforeEach(() => {
    TestBed.resetTestingModule();
    report.mockReset();
    show.mockReset();
    debug.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('reports a crash and leaves saying it to a debug toast', () => {
    const error = new TypeError('x is undefined');

    handler().handleError(error);

    expect(report).toHaveBeenCalledWith('web', error);
    expect(debug).toHaveBeenCalledWith('x is undefined');
    expect(show).not.toHaveBeenCalled();
  });

  it('tells about a failed request, which the server already knows of, without reporting it', () => {
    handler().handleError(new ApiError(500, 'Server error'));

    expect(report).not.toHaveBeenCalled();
    expect(show).toHaveBeenCalledWith('Server error', 'error');
  });
});
