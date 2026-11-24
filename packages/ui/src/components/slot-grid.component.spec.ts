import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { type SlotCell, SlotGridComponent } from './slot-grid.component';

const cells: SlotCell[] = [
  { n: 0, state: 'current' },
  { n: 1, state: 'filled' },
  { n: 2, state: 'empty' },
];

describe('SlotGridComponent', () => {
  it('says which slot was pressed', async () => {
    const pick = vi.fn();
    await render(SlotGridComponent, { inputs: { cells }, on: { pick } });

    await userEvent.click(screen.getByRole('button', { name: '01' }));

    expect(pick).toHaveBeenCalledWith(1);
  });

  it('picks nothing when disabled, and still says which slot is current', async () => {
    const pick = vi.fn();
    await render(SlotGridComponent, { inputs: { cells, disabled: true }, on: { pick } });

    await userEvent.click(screen.getByRole('button', { name: '01' }));

    expect(pick).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '00' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '00' })).toHaveAttribute('aria-pressed', 'true');
  });
});
