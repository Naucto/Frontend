import { Router } from '@angular/router';
import { ToastService } from '@naucto/ui';
import { render, screen } from '@testing-library/angular';
import { describe, expect, it, vi } from 'vitest';

import { ApiError } from '../../core/api/api-errors';
import { AuthStore } from '../../core/auth/auth.store';
import { testProviders } from '../../testing/providers';
import VerifyEmailPage from './verify-email.page';

async function renderPage(
  token: string | undefined,
  verifyEmail: (token: string) => Promise<void>,
): Promise<{ shown: string[]; navigate: ReturnType<typeof vi.spyOn> }> {
  const shown: string[] = [];
  const { fixture } = await render(VerifyEmailPage, {
    inputs: token === undefined ? {} : { token },
    providers: [
      ...testProviders(),
      { provide: AuthStore, useValue: { verifyEmail } },
      { provide: ToastService, useValue: { show: (text: string) => shown.push(text) } },
    ],
  });
  const navigate = vi.spyOn(fixture.debugElement.injector.get(Router), 'navigateByUrl');
  return { shown, navigate };
}

describe('VerifyEmailPage', () => {
  it('confirms the address from the link and goes on to the hub', async () => {
    const verifyEmail = vi.fn(() => Promise.resolve());
    await renderPage('the-token', verifyEmail);

    await vi.waitFor(() => {
      expect(verifyEmail).toHaveBeenCalledWith('the-token');
    });
  });

  it('says a spent or expired link no longer works', async () => {
    await renderPage('old', () =>
      Promise.reject(ApiError.from(400, { code: 'INVALID_EMAIL_TOKEN', message: 'expired' })),
    );

    expect(await screen.findByText(/does not work any more/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/sign-in');
  });

  it('asks nothing of the server without a token', async () => {
    const verifyEmail = vi.fn(() => Promise.resolve());
    await renderPage(undefined, verifyEmail);

    expect(await screen.findByText(/does not work any more/i)).toBeInTheDocument();
    expect(verifyEmail).not.toHaveBeenCalled();
  });
});
