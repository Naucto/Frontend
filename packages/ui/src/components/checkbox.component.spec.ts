import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { CheckboxComponent } from './checkbox.component';

describe('CheckboxComponent', () => {
  it('answers a click and says which state it is in', async () => {
    const { fixture } = await render(CheckboxComponent, { inputs: { label: 'Match case' } });
    const box = screen.getByRole('checkbox', { name: 'Match case' });
    expect(box).toHaveAttribute('aria-checked', 'false');

    await userEvent.click(box);
    expect(fixture.componentInstance.checked()).toBe(true);
    expect(box).toHaveAttribute('aria-checked', 'true');
  });

  it('will not be clicked when it is disabled', async () => {
    const { fixture } = await render(CheckboxComponent, {
      inputs: { label: 'Regexp', disabled: true },
    });
    await userEvent.click(screen.getByRole('checkbox', { name: 'Regexp' }));
    expect(fixture.componentInstance.checked()).toBe(false);
  });
});
