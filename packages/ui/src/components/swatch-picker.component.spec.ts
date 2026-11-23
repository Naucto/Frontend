import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { SwatchPickerComponent } from './swatch-picker.component';

const colours = ['#000000', '#ffffff', '#ff004d'];

describe('SwatchPickerComponent', () => {
  it('picks the slot pressed', async () => {
    const { fixture } = await render(SwatchPickerComponent, {
      inputs: { colours, slots: [0, 1, 2], value: 0 },
    });

    await userEvent.click(screen.getByRole('button', { name: 'Palette slot 2' }));

    expect(fixture.componentInstance.value()).toBe(2);
  });

  it('keeps its slot, its colours and its mark when disabled', async () => {
    const { fixture } = await render(SwatchPickerComponent, {
      inputs: { colours, slots: [0, 1, 2], value: 0, allowNone: true, disabled: true },
    });
    const chosen = screen.getByRole('button', { name: 'Palette slot 0' });

    await userEvent.click(screen.getByRole('button', { name: 'Palette slot 2' }));
    await userEvent.click(screen.getByRole('button', { name: 'No colour' }));

    expect(fixture.componentInstance.value()).toBe(0);
    for (const swatch of screen.getAllByRole('button')) {
      expect(swatch).toBeDisabled();
    }
    expect(chosen).toHaveAttribute('aria-pressed', 'true');
    expect(chosen.style.getPropertyValue('--bv-fill')).toBe('#000000');
  });
});
