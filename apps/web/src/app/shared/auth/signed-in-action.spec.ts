import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DialogService } from '@naucto/ui';
import { Subject } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';

import { AuthStore } from '../../core/auth/auth.store';
import { SignedInAction } from './signed-in-action';

const isAuthenticated = signal(false);
let closed: Subject<boolean | undefined>;
let opened = 0;
let ran = 0;
let declined = 0;

const action = (): void => {
  ran += 1;
};
const onDeclined = (): void => {
  declined += 1;
};

function setUp(signedIn: boolean): SignedInAction {
  isAuthenticated.set(signedIn);
  closed = new Subject();
  opened = 0;
  ran = 0;
  declined = 0;
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthStore, useValue: { isAuthenticated } },
      {
        provide: DialogService,
        useValue: {
          open: (): { closed: Subject<boolean | undefined> } => {
            opened += 1;
            return { closed };
          },
        },
      },
    ],
  });
  return TestBed.inject(SignedInAction);
}

describe('SignedInAction', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('runs straight away for a signed-in reader, without asking', () => {
    setUp(true).run(action, onDeclined);
    expect(ran).toBe(1);
    expect(opened).toBe(0);
    expect(declined).toBe(0);
  });

  it('asks a signed-out reader first, and runs once they have signed in', () => {
    setUp(false).run(action, onDeclined);
    expect(opened).toBe(1);
    expect(ran).toBe(0);
    closed.next(true);
    expect(ran).toBe(1);
    expect(declined).toBe(0);
  });

  /**
   * Escape and the backdrop close with `undefined`, not `false`; both are a refusal, and a netplay
   * request left pending on one of them would hang the game that made it.
   */
  it('declines when the dialog closes any other way', () => {
    setUp(false).run(action, onDeclined);
    closed.next(undefined);
    expect(ran).toBe(0);
    expect(declined).toBe(1);
  });
});
