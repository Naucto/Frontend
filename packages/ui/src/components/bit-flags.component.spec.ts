import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { BitFlagsComponent } from './bit-flags.component';

describe('BitFlagsComponent', () => {
  it('toggles bits of the byte', async () => {
    const { fixture } = await render(BitFlagsComponent, { inputs: { value: 0b0101 } });
    expect(screen.getByRole('checkbox', { name: 'Flag 0' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('checkbox', { name: 'Flag 1' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    await userEvent.click(screen.getByRole('checkbox', { name: 'Flag 1' }));
    expect(fixture.componentInstance.value()).toBe(0b0111);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Flag 0' }));
    expect(fixture.componentInstance.value()).toBe(0b0110);
  });
});
