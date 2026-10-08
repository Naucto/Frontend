import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { NumberFieldComponent } from './number-field.component';

/**
 * A box that may hold nothing is not a box holding zero: with no value, `null <= min` is true, so
 * no comparison may treat empty as the floor.
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
    expect(cleared).not.toHaveBeenCalled();

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

  it('keeps the value when the text typed is not a number', async () => {
    const cleared = vi.fn();
    const requested = vi.fn();
    await render(NumberFieldComponent, {
      inputs: { value: 4, min: 0, max: 9, clearable: true, ariaLabel: 'Place' },
      on: { cleared, requested },
    });

    const box = screen.getByRole('textbox', { name: 'Place' });
    await userEvent.clear(box);
    await userEvent.type(box, '1-2');
    await userEvent.tab();
    expect(cleared).not.toHaveBeenCalled();
    expect(requested).not.toHaveBeenCalled();
    expect(box).toHaveValue('4');
  });

  it('reads a decimal as the number it is, not as its digits run together', async () => {
    const requested = vi.fn();
    await render(NumberFieldComponent, {
      inputs: { value: 120, min: 1, max: 999, ariaLabel: 'Tempo' },
      on: { requested },
    });

    const box = screen.getByRole('textbox', { name: 'Tempo' });
    await userEvent.clear(box);
    await userEvent.type(box, '120.4');
    await userEvent.tab();
    expect(requested).not.toHaveBeenCalledWith(999);
  });
});

describe('NumberFieldComponent, typed and stepped', () => {
  it('asks for the number typed', async () => {
    const requested = vi.fn();
    await render(NumberFieldComponent, {
      inputs: { value: 4, min: 0, max: 9, ariaLabel: 'Place' },
      on: { requested },
    });

    const box = screen.getByRole('textbox', { name: 'Place' });
    await userEvent.clear(box);
    await userEvent.type(box, '7');
    await userEvent.tab();
    expect(requested).toHaveBeenCalledWith(7);
  });

  it('clamps a typed value to the ceiling', async () => {
    const requested = vi.fn();
    await render(NumberFieldComponent, {
      inputs: { value: 4, min: 0, max: 9, ariaLabel: 'Place' },
      on: { requested },
    });

    const box = screen.getByRole('textbox', { name: 'Place' });
    await userEvent.clear(box);
    await userEvent.type(box, '99');
    await userEvent.tab();
    expect(requested).toHaveBeenCalledWith(9);
  });

  it('steps past any number where it has no ceiling, and widens to show it', async () => {
    const requested = vi.fn();
    await render(NumberFieldComponent, {
      inputs: { value: 999, min: 0, max: Infinity, pad: 2, ariaLabel: 'Place' },
      on: { requested },
    });

    const box = screen.getByRole('textbox', { name: 'Place' });
    expect(box.style.width).toBe('3ch');
    await userEvent.click(box);
    await userEvent.keyboard('{ArrowUp}');
    expect(requested).toHaveBeenCalledWith(1000);
  });

  it('snaps a typed value to the nearest step', async () => {
    const requested = vi.fn();
    await render(NumberFieldComponent, {
      inputs: { value: 16, min: 16, max: 64, step: 16, ariaLabel: 'BPM' },
      on: { requested },
    });

    const box = screen.getByRole('textbox', { name: 'BPM' });
    await userEvent.clear(box);
    await userEvent.type(box, '20');
    await userEvent.tab();
    expect(requested).not.toHaveBeenCalled();

    await userEvent.clear(box);
    await userEvent.type(box, '40');
    await userEvent.tab();
    expect(requested).toHaveBeenCalledWith(48);
  });

  it('asks for nothing when the typed value is the one already held', async () => {
    const requested = vi.fn();
    await render(NumberFieldComponent, {
      inputs: { value: 4, min: 0, max: 9, ariaLabel: 'Place' },
      on: { requested },
    });

    const box = screen.getByRole('textbox', { name: 'Place' });
    await userEvent.clear(box);
    await userEvent.type(box, '4');
    await userEvent.tab();
    expect(requested).not.toHaveBeenCalled();
    expect(box).toHaveValue('4');
  });

  it('steps with the arrow keys, not only the carets', async () => {
    const requested = vi.fn();
    await render(NumberFieldComponent, {
      inputs: { value: 4, min: 0, max: 9, ariaLabel: 'Place' },
      on: { requested },
    });

    const box = screen.getByRole('textbox', { name: 'Place' });
    await userEvent.click(box);
    await userEvent.keyboard('{ArrowUp}');
    expect(requested).toHaveBeenCalledWith(5);
  });

  it('ignores text that is not a number, and shows the value it still holds', async () => {
    const cleared = vi.fn();
    const requested = vi.fn();
    await render(NumberFieldComponent, {
      inputs: { value: 4, min: 0, max: 9, clearable: true, ariaLabel: 'Place' },
      on: { cleared, requested },
    });

    const box = screen.getByRole('textbox', { name: 'Place' });
    await userEvent.clear(box);
    await userEvent.type(box, 'x');
    await userEvent.tab();
    expect(cleared).not.toHaveBeenCalled();
    expect(requested).not.toHaveBeenCalled();
    expect(box).toHaveValue('4');
  });
});
