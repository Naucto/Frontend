import { ToastService } from '@naucto/ui';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { ApiError } from '../../core/api/api-errors';
import { AuthStore } from '../../core/auth/auth.store';
import { testProviders } from '../../testing/providers';
import { SignInFormComponent } from './sign-in-form.component';

const shown: string[] = [];
const toasts = {
  show: (text: string): void => {
    shown.push(text);
  },
};

/** Refuses a registration the way the API does, body and all. */
function refusing(status: number, body: unknown): { register: () => Promise<never> } {
  return { register: () => Promise.reject(ApiError.from(status, body)) };
}

async function registerAndFail(status: number, body: unknown): Promise<void> {
  await render(SignInFormComponent, {
    providers: [
      ...testProviders(),
      { provide: ToastService, useValue: toasts },
      { provide: AuthStore, useValue: refusing(status, body) },
    ],
  });
  await userEvent.click(screen.getByRole('button', { name: /make one/i }));
  await userEvent.click(screen.getByRole('button', { name: /create account/i }));
}

describe('SignInFormComponent', () => {
  beforeEach(() => {
    shown.length = 0;
  });

  it('says the refusal in this app words when it knows the rule', async () => {
    await registerAndFail(409, {
      message: 'Email already in use',
      violations: [{ field: 'email', code: 'EMAIL_TAKEN' }],
    });

    expect(shown).toEqual(['That email address already has an account. Sign in instead?']);
  });

  /** A rule this app has no wording for still has to reach the person who broke it. */
  it('repeats what the server said when it does not', async () => {
    await registerAndFail(400, {
      message: ['Roulette is not a colour'],
      violations: [{ field: 'colour', code: 'SOMETHING_NEW' }],
    });

    expect(shown).toEqual(['Roulette is not a colour']);
  });
});
