import { render, screen } from '@testing-library/angular';

import { SliderComponent } from './slider.component';

describe('SliderComponent', () => {
  it('fills the track from the initial value before any interaction', async () => {
    await render(SliderComponent, { inputs: { value: 25, min: 0, max: 200, label: 'BPM' } });
    const range = screen.getByRole('slider', { name: 'BPM' });
    expect(range.style.getPropertyValue('--nc-fill')).toBe('12.5%');
  });

  it('updates the fill when the value input changes', async () => {
    const { rerender } = await render(SliderComponent, {
      inputs: { value: 0, min: 0, max: 100, label: 'R' },
    });
    const range = screen.getByRole('slider', { name: 'R' });
    expect(range.style.getPropertyValue('--nc-fill')).toBe('0%');
    await rerender({ inputs: { value: 100, min: 0, max: 100, label: 'R' } });
    expect(range.style.getPropertyValue('--nc-fill')).toBe('100%');
  });

  it('clamps the fill to the track', async () => {
    await render(SliderComponent, { inputs: { value: 500, min: 0, max: 100, label: 'X' } });
    const range = screen.getByRole('slider', { name: 'X' });
    expect(range.style.getPropertyValue('--nc-fill')).toBe('100%');
  });
});
