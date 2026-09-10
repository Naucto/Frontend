import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { NumberFieldComponent } from './number-field.component';

/**
 * A box that may hold nothing is not a box holding zero, and every arithmetic in the field had to
 * learn the difference. The floor caret is the one that gave it away: with no value, `null <= min`
 * is true, so the way out of an empty box was the control that was switched off.
 */
describe('NumberFieldComponent, empty', () => {
  it('offers a way out of an empty box, and a way back in', async () => {
    const cleared = vi.fn();
    const requested = vi.fn();
    await render(NumberFieldComponent, {
      inputs: { value: null, min: 0, max: 9, clearable: true, ariaLabel: 'Place' },
      on: { cleared, requested },
    });

    await userEvent.click(screen.getByRole('button', { name: 'Place +1' }));
    expect(requested).toHaveBeenCalledWith(0);

    // Nothing below nothing: an empty box has no number to step away from.
    expect(screen.getByRole('button', { name: 'Place -1' })).toBeDisabled();
  });

  it('empties the box when the floor is stepped past, rather than stopping there', async () => {
    const cleared = vi.fn();
    await render(NumberFieldComponent, {
      inputs: { value: 0, min: 0, max: 9, clearable: true, ariaLabel: 'Place' },
      on: { cleared },
    });

    await userEvent.click(screen.getByRole('button', { name: 'Place -1' }));
    expect(cleared).toHaveBeenCalled();
  });

  /** A box that cannot be emptied keeps the old behaviour: the floor is the floor. */
  it('stops at the floor where the value is a setting', async () => {
    const cleared = vi.fn();
    await render(NumberFieldComponent, {
      inputs: { value: 0, min: 0, max: 9, ariaLabel: 'Steps' },
      on: { cleared },
    });

    expect(screen.getByRole('button', { name: 'Steps -1' })).toBeDisabled();
    expect(cleared).not.toHaveBeenCalled();
  });

  it('reports an emptied box on blur, and never writes the word null into it', async () => {
    const cleared = vi.fn();
    await render(NumberFieldComponent, {
      inputs: { value: 4, min: 0, max: 9, clearable: true, pad: 2, ariaLabel: 'Place' },
      on: { cleared },
    });

    const box = screen.getByRole('textbox', { name: 'Place' });
    expect(box).toHaveValue('04');

    await userEvent.clear(box);
    await userEvent.tab();
    expect(cleared).toHaveBeenCalled();
    // The owner has not written the new value back, so the box shows what it still holds.
    expect(box).toHaveValue('04');
  });
});
