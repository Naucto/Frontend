import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { SegmentedComponent } from './segmented.component';

describe('SegmentedComponent', () => {
  it('selects an option and updates the model', async () => {
    const { fixture } = await render(SegmentedComponent, {
      inputs: {
        options: [
          { value: 'draft', label: 'Draft' },
          { value: 'public', label: 'Public' },
        ],
        value: 'draft',
      },
    });
    expect(screen.getByRole('radio', { name: 'Draft' })).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(screen.getByRole('radio', { name: 'Public' }));
    expect(fixture.componentInstance.value()).toBe('public');
    expect(screen.getByRole('radio', { name: 'Public' })).toHaveAttribute('aria-checked', 'true');
  });
});
