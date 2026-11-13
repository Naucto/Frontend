import { TestBed } from '@angular/core/testing';

import { ToastService } from './toast.service';

describe('ToastService', () => {
  it('shows a debug message in a development build, where tests run', () => {
    const toasts = TestBed.inject(ToastService);

    toasts.debug('x is undefined');

    expect(toasts.toasts()).toEqual([{ id: 1, text: 'x is undefined', tone: 'error' }]);
  });
});
