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

/**
 * The small strip sits on the thing it chooses between, and its tabs are names somebody typed.
 * Both were got wrong once: a rule under it read as the top of a second box, and capitals read as
 * a row of headings.
 */
it('draws a small strip with no rule under it, in ordinary sentence case', async () => {
  await render(TabsComponent, { inputs: { tabs, value: 'account', variant: 'small' } });
  const tab = screen.getByRole('tab', { name: 'Account' });
  const list = screen.getByRole('tablist');

  expect(tab.className).not.toContain('uppercase');
  expect(tab.className).toContain('aria-selected:border-gold');
  expect(list.className).not.toContain('border-b');
});

/** A tab that reserved room for buttons it was not showing left a hole beside every name. */
it('gives the per-tab buttons no room until they show', async () => {
  await render(TabsComponent, {
    inputs: { tabs, value: 'account', variant: 'small', editable: true, removable: true },
  });
  const pencil = screen.getAllByRole('button', { name: 'Rename' })[0];

  expect(pencil?.className).toContain('hidden');
  expect(pencil?.className).toContain('group-hover:inline-flex');
});

it('offers no trash on the last tab, since a list of none is nothing to choose from', async () => {
  await render(TabsComponent, {
    inputs: { tabs: tabs.slice(0, 1), value: 'account', variant: 'small', removable: true },
  });

  expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
});

/**
 * A strip has one line and never folds, so when it runs out of room it runs out sideways. The
 * arrows are how somebody without a trackpad gesture reaches what has gone past the edge, and they
 * only appear where there is something to reach.
 */
describe('TabsComponent, overflowing', () => {
  it('offers no arrows while every tab is in view', async () => {
    await render(TabsComponent, { inputs: { tabs, value: 'account' } });
    expect(screen.queryByRole('button', { name: 'Earlier tabs' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Later tabs' })).toBeNull();
  });

  it('keeps what the owner hangs on the strip out of the part that scrolls', async () => {
    await render(TabsComponent, { inputs: { tabs, value: 'account' } });
    const list = screen.getByRole('tablist');
    // The actions slot and the spacer are the strip's, not the tabs': inside the scroller they
    // would slide away with them.
    expect(list.querySelector('.flex-1')).toBeNull();
    expect(list.className).toContain('overflow-x-auto');
  });
});
