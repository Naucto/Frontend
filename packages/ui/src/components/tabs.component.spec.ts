import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { TabsComponent } from './tabs.component';

const tabs = [
  { value: 'account', label: 'Account' },
  { value: 'editor', label: 'Editor' },
  { value: 'controls', label: 'Controls' },
];

describe('TabsComponent', () => {
  it('moves selection with arrow keys and wraps', async () => {
    await render(TabsComponent, { inputs: { tabs, value: 'account' } });
    screen.getByRole('tab', { name: 'Account' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Editor' })).toHaveAttribute('aria-selected', 'true');
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'Controls' })).toHaveAttribute('aria-selected', 'true');
    await userEvent.keyboard('{Home}');
    expect(screen.getByRole('tab', { name: 'Account' })).toHaveAttribute('aria-selected', 'true');
  });
});

/** The panel strip is too tall to sit over a preview and leave the preview any room. */
it('draws a small strip more tightly than the panel one', async () => {
  const { fixture } = await render(TabsComponent, {
    inputs: { tabs, value: 'account', variant: 'small' },
  });
  const tab = screen.getByRole('tab', { name: 'Account' });

  expect(tab.className).toContain('text-micro');
  expect(tab.className).toContain('aria-selected:border-gold');
  fixture.detectChanges();
});
