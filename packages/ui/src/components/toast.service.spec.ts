import { TestBed } from '@angular/core/testing';

import { ToastService } from './toast.service';

describe('ToastService', () => {
  it('shows a debug message in a development build, where tests run', () => {
    const toasts = TestBed.inject(ToastService);

    toasts.debug('x is undefined');

    expect(toasts.toasts()).toEqual([{ id: 1, text: 'x is undefined', tone: 'error' }]);
  });

  it('runs the action of a toast once, and takes the toast away', () => {
    const toasts = TestBed.inject(ToastService);
    let runs = 0;

    const id = toasts.show('Pattern removed', 'info', 6000, {
      label: 'Undo',
      run: () => {
        runs += 1;
      },
    });
    toasts.act(id);
    toasts.act(id);

    expect(runs).toBe(1);
    expect(toasts.toasts()).toEqual([]);
  });
});
