import { ToastService } from '@naucto/ui';
import { render, screen, waitFor } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../../core/api/api-errors';
import { AuthStore } from '../../core/auth/auth.store';
import { OAuthService } from '../../core/auth/oauth/oauth.service';
import { type OAuthProviderFlow } from '../../core/auth/oauth/oauth-provider';
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

/** Any provider will do; the form only reads the label, the mark and whether it is configured. */
const elsewhere: OAuthProviderFlow = {
  id: 'github',
  label: 'Elsewhere',
  mark: 'github',
  kind: 'redirect',
  configured: () => true,
  start: () => Promise.resolve('left-page'),
  finish: () => Promise.resolve('never'),
};

interface FakeOAuth {
  start: ReturnType<typeof vi.fn>;
  abandon: ReturnType<typeof vi.fn>;
}

async function renderWithOAuth(
  start: () => Promise<'left-page' | 'signed-in'>,
  configured = true,
): Promise<FakeOAuth> {
  const oauth = {
    providers: () => [elsewhere],
    isConfigured: () => configured,
    start: vi.fn(start),
    abandon: vi.fn(),
  };
  await render(SignInFormComponent, {
    providers: [
      ...testProviders(),
      { provide: ToastService, useValue: toasts },
      { provide: AuthStore, useValue: {} },
      { provide: OAuthService, useValue: oauth },
    ],
  });
  return oauth;
}

describe('SignInFormComponent, signing in elsewhere', () => {
  beforeEach(() => {
    shown.length = 0;
  });

  it('gives the button back when the provider did not come through', async () => {
    await renderWithOAuth(() => Promise.reject(new Error('popup_closed')));
    const button = screen.getByRole('button', { name: /elsewhere/i });

    await userEvent.click(button);

    await waitFor(() => {
      expect(button).toBeEnabled();
    });
    expect(shown).toEqual(['That sign-in did not complete.']);
  });

  it('keeps the button down while the page is on its way out', async () => {
    await renderWithOAuth(() => Promise.resolve('left-page'));
    const button = screen.getByRole('button', { name: /elsewhere/i });

    await userEvent.click(button);

    await waitFor(() => {
      expect(button).toBeDisabled();
    });
    expect(shown).toEqual([]);
  });

  it('draws a provider the server did not configure down, and says so', async () => {
    await renderWithOAuth(() => Promise.resolve('left-page'), false);
    const button = screen.getByRole('button', { name: /elsewhere/i });

    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('title', 'Not configured on this server.');
  });

  /** Back from the provider's page, the browser restores this one as it was left: buttons down. */
  it('rearms after the page comes back from the browser cache', async () => {
    const oauth = await renderWithOAuth(() => new Promise(() => undefined));
    const button = screen.getByRole('button', { name: /elsewhere/i });
    await userEvent.click(button);
    await waitFor(() => {
      expect(button).toBeDisabled();
    });

    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));

    await waitFor(() => {
      expect(button).toBeEnabled();
    });
    expect(oauth.abandon).toHaveBeenCalledTimes(1);
  });
});
