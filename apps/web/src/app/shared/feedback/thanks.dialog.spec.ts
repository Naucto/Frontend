import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { testProviders } from '../../testing/providers';
import { DISCORD_INVITE, ThanksDialog } from './thanks.dialog';

describe('ThanksDialog', () => {
  const open = async (data: unknown): Promise<ReturnType<typeof vi.fn>> => {
    const close = vi.fn();
    await render(ThanksDialog, {
      providers: [
        ...testProviders(),
        { provide: DialogRef, useValue: { close } },
        { provide: DIALOG_DATA, useValue: data },
      ],
    });
    return close;
  };

  it('thanks for a report by its number and invites to Discord in a new tab', async () => {
    await open({ kind: 'bug', id: 31 });

    expect(await screen.findByText(/Report #31 reached the team/)).toBeTruthy();
    const link = screen.getByRole('link', { name: 'Join our Discord' });
    expect(link).toHaveAttribute('href', DISCORD_INVITE);
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('closes on OK and on its cross', async () => {
    const close = await open({ kind: 'rating' });

    await userEvent.click(await screen.findByRole('button', { name: 'OK' }));
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(close).toHaveBeenCalledTimes(2);
  });
});
