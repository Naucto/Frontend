import { render, screen } from '@testing-library/angular';
import { describe, expect, it, vi } from 'vitest';

import { ApiError } from '../../core/api/api-errors';
import { AuthStore } from '../../core/auth/auth.store';
import { testProviders } from '../../testing/providers';
import VerifyEmailPage from './verify-email.page';

async function renderPage(
  token: string | undefined,
  verifyEmail: (token: string) => Promise<void>,
  isAuthenticated = false,
): Promise<void> {
  await render(VerifyEmailPage, {
    inputs: token === undefined ? {} : { token },
    providers: [
      ...testProviders(),
      { provide: AuthStore, useValue: { verifyEmail, isAuthenticated: () => isAuthenticated } },
    ],
  });
}

describe('VerifyEmailPage', () => {
  it('confirms the address from the link and points to signing in', async () => {
    const verifyEmail = vi.fn(() => Promise.resolve());
    await renderPage('the-token', verifyEmail);

    expect(await screen.findByText(/address confirmed/i)).toBeInTheDocument();
    expect(verifyEmail).toHaveBeenCalledWith('the-token');
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/sign-in');
  });

  it('points to the hub instead when the reader is already signed in', async () => {
    await renderPage('the-token', () => Promise.resolve(), true);

    expect(await screen.findByText(/address confirmed/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /hub/i })).toHaveAttribute('href', '/hub');
  });

  it('says a spent or expired link no longer works', async () => {
    await renderPage('old', () =>
      Promise.reject(ApiError.from(400, { code: 'INVALID_EMAIL_TOKEN', message: 'expired' })),
    );

    expect(await screen.findByText(/does not work any more/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/sign-in');
  });

  it('keeps the link and offers to retry when the server cannot be reached', async () => {
    const verifyEmail = vi
      .fn<(token: string) => Promise<void>>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(undefined);
    await renderPage('the-token', verifyEmail);

    expect(await screen.findByText(/could not confirm/i)).toBeInTheDocument();
    expect(screen.queryByText(/does not work any more/i)).not.toBeInTheDocument();

    screen.getByRole('button', { name: /try again/i }).click();

    expect(await screen.findByText(/address confirmed/i)).toBeInTheDocument();
    expect(verifyEmail).toHaveBeenCalledTimes(2);
  });

  it('treats a server error other than a spent link as retryable', async () => {
    await renderPage('the-token', () =>
      Promise.reject(ApiError.from(502, { code: 'BAD_GATEWAY', message: 'down' })),
    );

    expect(await screen.findByText(/could not confirm/i)).toBeInTheDocument();
  });

  it('asks nothing of the server without a token', async () => {
    const verifyEmail = vi.fn(() => Promise.resolve());
    await renderPage(undefined, verifyEmail);

    expect(await screen.findByText(/does not work any more/i)).toBeInTheDocument();
    expect(verifyEmail).not.toHaveBeenCalled();
  });
});
