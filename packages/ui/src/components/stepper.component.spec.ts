import { fireEvent, render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { StepperComponent } from './stepper.component';

const SIZES = ['1×1', '2×2', '4×4', '8×8'];

describe('StepperComponent', () => {
  it('names the current step', async () => {
    await render(StepperComponent, { inputs: { value: 2, options: SIZES, label: 'Size' } });
    expect(screen.getByRole('slider', { name: 'Size' })).toHaveAttribute('aria-valuetext', '4×4');
  });

  it('moves one stop per arrow key and stops at either end', async () => {
    const { fixture } = await render(StepperComponent, {
      inputs: { value: 2, options: SIZES, label: 'Size' },
    });
    const range = screen.getByRole('slider', { name: 'Size' });
    range.focus();
    await userEvent.keyboard('{ArrowRight}{ArrowRight}');
    expect(fixture.componentInstance.value()).toBe(3);
    await userEvent.keyboard('{Home}');
    expect(fixture.componentInstance.value()).toBe(0);
  });

  it('follows the pointer between two stops and settles on the nearest when let go', async () => {
    const { fixture } = await render(StepperComponent, {
      inputs: { value: 0, options: SIZES, label: 'Size' },
    });
    const range = screen.getByRole<HTMLInputElement>('slider', { name: 'Size' });
    const thumb = range.nextElementSibling as HTMLElement;

    fireEvent.input(range, { target: { value: '1.8' } });
    expect(fixture.componentInstance.value()).toBe(2);
    expect(thumb.style.left).toBe('60%');

    fireEvent.change(range);
    fixture.detectChanges();
    expect(thumb.style.left).toBe(`${String((2 / 3) * 100)}%`);
  });

  it('picks a step from its caption', async () => {
    const { fixture } = await render(StepperComponent, { inputs: { value: 0, options: SIZES } });
    await userEvent.click(screen.getByRole('button', { name: '8×8' }));
    expect(fixture.componentInstance.value()).toBe(3);
  });

  it('ticks the stops between the two ends only', async () => {
    const { container } = await render(StepperComponent, { inputs: { value: 0, options: SIZES } });
    expect(container.querySelectorAll('.w-\\[3px\\]')).toHaveLength(2);
  });
});
