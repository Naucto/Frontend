import { render, screen } from '@testing-library/angular';

import { MeterComponent } from './meter.component';

describe('MeterComponent', () => {
  it('reports total and flags overflow', async () => {
    await render(MeterComponent, {
      inputs: {
        segments: [
          { label: 'a', value: 700, color: 'bg-sky' },
          { label: 'b', value: 400, color: 'bg-hot' },
        ],
        max: 1000,
        label: 'Size',
      },
    });
    const meter = screen.getByRole('meter', { name: 'Size' });
    expect(meter).toHaveAttribute('aria-valuenow', '1100');
    expect(meter.className).toContain('outline-hot');
  });
});
