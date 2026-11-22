import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { CanMatchFn } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';

import { staffGuard } from './auth.guard';
import { AuthStore } from './auth.store';

/** The guard reads the session alone, so the route it is asked about can be anything. */
const NO_ROUTE = [{}, [], {}] as unknown as Parameters<CanMatchFn>;

describe('staffGuard', () => {
  const isStaff = signal(false);
  const matches = (): unknown => TestBed.runInInjectionContext(() => staffGuard(...NO_ROUTE));

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: AuthStore, useValue: { isStaff } }],
    });
  });

  it('matches the route for staff', () => {
    isStaff.set(true);

    expect(matches()).toBe(true);
  });

  it('leaves the route unmatched for anyone else, with no redirect that would give it away', () => {
    isStaff.set(false);

    expect(matches()).toBe(false);
  });
});
