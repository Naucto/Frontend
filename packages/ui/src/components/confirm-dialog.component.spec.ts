import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { fireEvent, render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { ConfirmDialogComponent, type ConfirmDialogData } from './confirm-dialog.component';

const open = async (data: Partial<ConfirmDialogData>): Promise<ReturnType<typeof vi.fn>> => {
  const close = vi.fn();
  await render(ConfirmDialogComponent, {
    providers: [
      {
        provide: DIALOG_DATA,
        useValue: { title: 'Delete this sheet?', message: 'Its art goes with it.', ...data },
      },
      { provide: DialogRef, useValue: { close } },
    ],
  });
  return close;
};

describe('ConfirmDialogComponent', () => {
  it('sets one message as one paragraph', async () => {
    await open({ message: 'Its art goes with it.' });
    expect(screen.getAllByRole('paragraph')).toHaveLength(1);
  });

  it('sets a string with blank lines as one paragraph per block', async () => {
    await open({ message: 'Its art goes with it.\n\nThis cannot be undone.' });
    expect(screen.getAllByRole('paragraph')).toHaveLength(2);
  });

  it('sets a list of messages one paragraph each, in order', async () => {
    await open({ message: ['Its art goes with it.', 'This cannot be undone.'] });
    const ps = screen.getAllByRole('paragraph');
    expect(ps.map((paragraph) => paragraph.textContent?.trim())).toEqual([
      'Its art goes with it.',
      'This cannot be undone.',
    ]);
  });

  /** Whatever backs out sits to the left of what confirms, which is always last. */
  it('writes the confirm button last, after the cancel', async () => {
    await open({ confirmLabel: 'Delete', danger: true });
    const footer = screen.getByRole('contentinfo');
    const labels = [...footer.querySelectorAll('button')].map((button) =>
      button.textContent?.trim(),
    );
    expect(labels).toEqual(['Cancel', 'Delete']);
  });

  it('closes with true on confirm and false on cancel', async () => {
    const close = await open({ confirmLabel: 'Delete' });
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(close.mock.calls).toEqual([[true], [false]]);
  });
});

describe('ConfirmDialogComponent, by the name', () => {
  const friction = { kind: 'name', name: 'Hightide', label: 'Type Hightide to confirm' } as const;

  it('arms the confirm button only once the name is typed out', async () => {
    const close = await open({ confirmLabel: 'Delete game', friction });
    const confirm = screen.getByRole('button', { name: 'Delete game' });
    const field = screen.getByLabelText('Type Hightide to confirm');
    expect(confirm).toBeDisabled();

    await userEvent.type(field, 'Hightid');
    expect(confirm).toBeDisabled();
    expect(field).not.toHaveAttribute('aria-invalid');

    await userEvent.type(field, 'e');
    expect(confirm).toBeEnabled();
    await userEvent.click(confirm);
    expect(close).toHaveBeenCalledWith(true);
  });

  it('marks the field once what is typed is long enough and still not the name', async () => {
    await open({ friction });
    const field = screen.getByLabelText('Type Hightide to confirm');
    await userEvent.type(field, 'hightide');
    expect(field).toHaveAttribute('aria-invalid', 'true');
  });

  it('does not confirm on Enter while the name is wrong', async () => {
    const close = await open({ friction });
    await userEvent.type(screen.getByLabelText('Type Hightide to confirm'), 'High{Enter}');
    expect(close).not.toHaveBeenCalled();
  });
});

describe('ConfirmDialogComponent, by the password', () => {
  it('closes with what was typed, and not before something is', async () => {
    const close = await open({
      confirmLabel: 'Delete',
      friction: { kind: 'password', label: 'Password' },
    });
    const field = screen.getByLabelText('Password');
    expect(field).toHaveAttribute('type', 'password');
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();

    await userEvent.type(field, 'hunter2{Enter}');
    expect(close).toHaveBeenCalledWith('hunter2');
  });
});

describe('ConfirmDialogComponent, by a hold', () => {
  const friction = {
    kind: 'hold',
    holdingLabel: 'Keep holding…',
    hint: 'Hold Space or Enter for 1.2 seconds',
    duration: 60,
  } as const;
  const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

  it('confirms once the button has been held for the whole time', async () => {
    const close = await open({ confirmLabel: 'Hold to end', friction });
    const button = screen.getByRole('button', { name: 'Hold to end' });

    fireEvent.pointerDown(button);
    expect(close).not.toHaveBeenCalled();
    expect(await screen.findByText('Keep holding…')).toBeInTheDocument();

    await wait(90);
    expect(close).toHaveBeenCalledWith(true);
  });

  it('backs out when the button is let go early, and a click alone does nothing', async () => {
    const close = await open({ confirmLabel: 'Hold to end', friction });
    const button = screen.getByRole('button', { name: 'Hold to end' });

    fireEvent.pointerDown(button);
    fireEvent.pointerUp(button);
    fireEvent.click(button);
    await wait(90);
    expect(close).not.toHaveBeenCalled();
  });

  it('is held from the keyboard with Space or Enter', async () => {
    const close = await open({ confirmLabel: 'Hold to end', friction });
    const button = screen.getByRole('button', { name: 'Hold to end' });
    expect(button).toHaveAttribute('aria-description', friction.hint);

    fireEvent.keyDown(button, { key: 'Enter' });
    fireEvent.keyUp(button, { key: 'Enter' });
    await wait(90);
    expect(close).not.toHaveBeenCalled();

    fireEvent.keyDown(button, { key: ' ' });
    await wait(90);
    expect(close).toHaveBeenCalledWith(true);
  });
});
