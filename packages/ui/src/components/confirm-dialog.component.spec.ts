import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { render, screen } from '@testing-library/angular';

import { ConfirmDialogComponent, type ConfirmDialogData } from './confirm-dialog.component';

const open = (message: ConfirmDialogData['message']): Promise<unknown> =>
  render(ConfirmDialogComponent, {
    providers: [
      { provide: DIALOG_DATA, useValue: { title: 'Delete this sheet?', message } },
      { provide: DialogRef, useValue: { close: (): void => undefined } },
    ],
  });

describe('ConfirmDialogComponent', () => {
  it('sets one message as one paragraph', async () => {
    await open('Its art goes with it.');
    expect(screen.getAllByRole('paragraph')).toHaveLength(1);
  });

  it('sets a string with blank lines as one paragraph per block', async () => {
    await open('Its art goes with it.\n\nThis cannot be undone.');
    expect(screen.getAllByRole('paragraph')).toHaveLength(2);
  });

  it('sets a list of messages one paragraph each, in order', async () => {
    await open(['Its art goes with it.', 'This cannot be undone.']);
    const ps = screen.getAllByRole('paragraph');
    expect(ps.map((p) => p.textContent?.trim())).toEqual([
      'Its art goes with it.',
      'This cannot be undone.',
    ]);
  });
});
