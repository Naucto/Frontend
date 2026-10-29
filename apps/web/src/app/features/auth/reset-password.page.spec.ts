import { ToastService } from '@naucto/ui';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ApiError } from '../../core/api/api-errors';
import { AuthStore } from '../../core/auth/auth.store';
import { testProviders } from '../../testing/providers';
import ResetPasswordPage from './reset-password.page';

async function renderPage(
  resetPassword: (token: string, password: string) => Promise<void>,
): Promise<string[]> {
  const shown: string[] = [];
  await render(ResetPasswordPage, {
    inputs: { token: 'the-token' },
    providers: [
      ...testProviders(),
      { provide: AuthStore, useValue: { resetPassword } },
      { provide: ToastService, useValue: { show: (text: string) => shown.push(text) } },
    ],
  });
  return shown;
}

describe('ResetPasswordPage', () => {
  it('sets the new password with the token from the link', async () => {
    const resetPassword = vi.fn(() => Promise.resolve());
    const shown = await renderPage(resetPassword);

    await userEvent.type(screen.getByLabelText(/new password/i), 'new-pass-1');
    await userEvent.click(screen.getByRole('button', { name: /save and sign in/i }));

    expect(resetPassword).toHaveBeenCalledWith('the-token', 'new-pass-1');
    await vi.waitFor(() => {
      expect(shown).toEqual(['Password changed — you are signed in.']);
    });
  });

  it('says the link is spent instead of asking again', async () => {
    await renderPage(() =>
      Promise.reject(ApiError.from(400, { code: 'INVALID_EMAIL_TOKEN', message: 'expired' })),
    );

    await userEvent.type(screen.getByLabelText(/new password/i), 'new-pass-1');
    await userEvent.click(screen.getByRole('button', { name: /save and sign in/i }));

    expect(await screen.findByText(/does not work any more/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/new password/i)).not.toBeInTheDocument();
  });

  it('says which rule a weak password broke', async () => {
    const shown = await renderPage(() =>
      Promise.reject(
        ApiError.from(400, {
          message: 'weak',
          violations: [{ field: 'newPassword', code: 'PASSWORD_TOO_WEAK' }],
        }),
      ),
    );

    await userEvent.type(screen.getByLabelText(/new password/i), 'aaaaaaaaaa');
    await userEvent.click(screen.getByRole('button', { name: /save and sign in/i }));

    await vi.waitFor(() => {
      expect(shown).toEqual([
        'That password uses only one kind of character. Mix in digits or symbols.',
      ]);
    });
  });
});
