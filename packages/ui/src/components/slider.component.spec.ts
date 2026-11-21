import { render, screen } from '@testing-library/angular';

import { SliderComponent } from './slider.component';

/** The fill and the thumb's slot are the range's two siblings in the groove. */
function parts(range: HTMLElement): { fill: HTMLElement; thumb: HTMLElement } {
  return {
    fill: range.previousElementSibling as HTMLElement,
    thumb: range.nextElementSibling as HTMLElement,
  };
}

describe('SliderComponent', () => {
  it('fills the track and places the thumb from the initial value, before any interaction', async () => {
    await render(SliderComponent, { inputs: { value: 25, min: 0, max: 200, label: 'BPM' } });
    const { fill, thumb } = parts(screen.getByRole('slider', { name: 'BPM' }));
    expect(fill.style.width).toBe('12.5%');
    expect(thumb.style.left).toBe('12.5%');
  });

  it('updates the fill when the value input changes', async () => {
    const { rerender } = await render(SliderComponent, {
      inputs: { value: 0, min: 0, max: 100, label: 'R' },
    });
    const { fill } = parts(screen.getByRole('slider', { name: 'R' }));
    expect(fill.style.width).toBe('0%');
    await rerender({ inputs: { value: 100, min: 0, max: 100, label: 'R' } });
    expect(fill.style.width).toBe('100%');
  });

  it('clamps the fill to the track', async () => {
    await render(SliderComponent, { inputs: { value: 500, min: 0, max: 100, label: 'X' } });
    const { fill } = parts(screen.getByRole('slider', { name: 'X' }));
    expect(fill.style.width).toBe('100%');
  });

  it('fills with the primary colour unless an accent is asked for', async () => {
    const { rerender } = await render(SliderComponent, { inputs: { label: 'G' } });
    const { fill } = parts(screen.getByRole('slider', { name: 'G' }));
    expect(fill).toHaveClass('bg-primary');
    await rerender({ inputs: { label: 'G', accent: 'jade' } });
    expect(fill).toHaveClass('bg-jade');
  });
});
