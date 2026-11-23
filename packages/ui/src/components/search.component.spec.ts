import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { SearchComponent } from './search.component';

describe('SearchComponent', () => {
  it('holds what is typed and says so on Enter', async () => {
    const submitted = vi.fn();
    const { fixture } = await render(SearchComponent, {
      inputs: { placeholder: 'Filter' },
      on: { submitted },
    });

    await userEvent.type(screen.getByRole('searchbox', { name: 'Filter' }), 'score{Enter}');

    expect(fixture.componentInstance.value()).toBe('score');
    expect(submitted).toHaveBeenCalledWith('score');
  });

  it('takes nothing when disabled, and is drawn as a disabled well', async () => {
    const { fixture } = await render(SearchComponent, {
      inputs: { placeholder: 'Filter', disabled: true },
    });
    const box = screen.getByRole('searchbox', { name: 'Filter' });

    await userEvent.type(box, 'score');

    expect(box).toBeDisabled();
    expect(fixture.componentInstance.value()).toBe('');
    expect(fixture.nativeElement).toHaveClass('bevel-edge-line', 'text-ink-4');
  });
});
