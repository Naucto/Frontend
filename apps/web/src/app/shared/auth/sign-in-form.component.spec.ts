import { ToastService } from '@naucto/ui';
import { render, screen, waitFor } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../../core/api/api-errors';
import { AuthStore } from '../../core/auth/auth.store';
import { OAuthService } from '../../core/auth/oauth/oauth.service';
import { type OAuthProviderFlow } from '../../core/auth/oauth/oauth-provider';
import { testProviders } from '../../testing/providers';
import { RESEND_COOLDOWN_SECONDS, SignInFormComponent } from './sign-in-form.component';

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

describe('SignInFormComponent, waiting on a mailed link', () => {
  beforeEach(() => {
    shown.length = 0;
  });

  async function renderWith(auth: object): Promise<void> {
    await render(SignInFormComponent, {
      providers: [
        ...testProviders(),
        { provide: ToastService, useValue: toasts },
        { provide: AuthStore, useValue: auth },
      ],
    });
  }

  it('asks a new account to confirm its address instead of signing it in', async () => {
    const resendVerification = vi.fn(() => Promise.resolve());
    await renderWith({
      register: () => Promise.resolve('ada@example.com'),
      resendVerification,
    });

    await userEvent.click(screen.getByRole('button', { name: /make one/i }));
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByText(/we sent a link to ada@example\.com/i)).toBeInTheDocument();
  });

  it('keeps the resend button down for as long as the server would refuse it', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const resendVerification = vi.fn(() => Promise.resolve());
      await renderWith({
        register: () => Promise.resolve('ada@example.com'),
        resendVerification,
      });

      await user.click(screen.getByRole('button', { name: /make one/i }));
      await user.click(screen.getByRole('button', { name: /create account/i }));

      expect(await screen.findByRole('button', { name: /send again in \d+ s/i })).toBeDisabled();

      await vi.advanceTimersByTimeAsync(RESEND_COOLDOWN_SECONDS * 1000);
      await user.click(await screen.findByRole('button', { name: /send the link again/i }));
      expect(resendVerification).toHaveBeenCalledWith('ada@example.com');
      expect(await screen.findByRole('button', { name: /send again in \d+ s/i })).toBeDisabled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('turns a sign-in refused for an unconfirmed address into the same wait', async () => {
    await renderWith({
      loginWithPassword: () =>
        Promise.reject(
          ApiError.from(403, { message: 'Confirm first', code: 'EMAIL_NOT_VERIFIED' }),
        ),
    });

    await userEvent.type(screen.getByLabelText(/email/i), 'ada@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'secret-1');
    await userEvent.click(screen.getByRole('button', { name: /^sign in$/i }));

    expect(await screen.findByText(/confirm your address before signing in/i)).toBeInTheDocument();
    expect(shown).toEqual([]);
  });

  it('mails a reset link from the address alone', async () => {
    const forgotPassword = vi.fn(() => Promise.resolve());
    await renderWith({ forgotPassword });

    await userEvent.click(screen.getByRole('button', { name: /forgot your password/i }));
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/email/i), 'ada@example.com');
    await userEvent.click(screen.getByRole('button', { name: /send the link/i }));

    expect(forgotPassword).toHaveBeenCalledWith('ada@example.com');
    expect(await screen.findByText(/if ada@example\.com has an account/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /send the link again/i })).not.toBeInTheDocument();
  });
});

/** Any provider will do; the form only reads the label, the mark and whether it is configured. */
const elsewhere: OAuthProviderFlow = {
  id: 'github',
  label: 'Elsewhere',
  mark: { grid: [1, 1], rects: [] },
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
