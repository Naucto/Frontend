import { DialogRef } from '@angular/cdk/dialog';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { testProviders } from '../../testing/providers';
import { DeleteAccountDialog } from './delete-account.dialog';

it('deletes only once the password is typed, and hands it back', async () => {
  const close = vi.fn();
  await render(DeleteAccountDialog, {
    providers: [...testProviders(), { provide: DialogRef, useValue: { close } }],
  });

  const remove = await screen.findByRole('button', { name: 'Delete' });
  expect(remove).toBeDisabled();

  await userEvent.type(screen.getByLabelText('Password'), 'hunter2');
  await userEvent.click(remove);
  expect(close).toHaveBeenCalledWith('hunter2');
});
