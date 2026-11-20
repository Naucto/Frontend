import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ToastService } from '@naucto/ui';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthStore } from '../../core/auth/auth.store';
import { testProviders } from '../../testing/providers';
import { SignedInAction } from '../auth/signed-in-action';
import { GoodStandingAction } from './good-standing-action';

describe('GoodStandingAction', () => {
  const suspension = signal<{ since: string; until: string | null } | null>(null);
  /** Stands for the sign-in step: it runs the action, or declines, as the test says. */
  let signsIn = true;
  const show = vi.fn();
  const action = vi.fn();
  const onDeclined = vi.fn();

  const gate = (): GoodStandingAction => TestBed.inject(GoodStandingAction);

  beforeEach(() => {
    suspension.set(null);
    signsIn = true;
    vi.clearAllMocks();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        ...testProviders(),
        { provide: AuthStore, useValue: { suspension } },
        { provide: ToastService, useValue: { show } },
        {
          provide: SignedInAction,
          useValue: {
            run: (run: () => void, declined?: () => void): void => {
              if (signsIn) {
                run();
              } else {
                declined?.();
              }
            },
          },
        },
      ],
    });
  });

  it('runs the action for an account in good standing', () => {
    gate().run(action, onDeclined);

    expect(action).toHaveBeenCalledOnce();
    expect(onDeclined).not.toHaveBeenCalled();
    expect(show).not.toHaveBeenCalled();
  });

  it('tells a suspended account why nothing happens, and declines', () => {
    suspension.set({ since: '2026-11-01T00:00:00.000Z', until: null });

    gate().run(action, onDeclined);

    expect(action).not.toHaveBeenCalled();
    expect(onDeclined).toHaveBeenCalledOnce();
    expect(show).toHaveBeenCalledWith(expect.stringContaining('suspended'), 'warning');
  });

  it('declines without a word when the reader does not sign in', () => {
    signsIn = false;

    gate().run(action, onDeclined);

    expect(action).not.toHaveBeenCalled();
    expect(onDeclined).toHaveBeenCalledOnce();
    expect(show).not.toHaveBeenCalled();
  });
});
