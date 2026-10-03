import { render, screen, within } from '@testing-library/angular';
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

/** The small strip sits on the thing it chooses between, and its tabs are names somebody typed. */
it('draws a small strip with no rule under it, in ordinary sentence case', async () => {
  await render(TabsComponent, { inputs: { tabs, value: 'account', variant: 'small' } });
  const tab = screen.getByRole('tab', { name: 'Account' });
  const list = screen.getByRole('tablist');

  expect(tab.className).not.toContain('uppercase');
  expect(tab.className).toContain('aria-selected:border-gold');
  expect(list.className).not.toContain('border-b');
});

it('gives the per-tab buttons no room until they show', async () => {
  await render(TabsComponent, {
    inputs: { tabs, value: 'account', variant: 'small', editable: true, removable: true },
  });
  const pencil = screen.getAllByRole('button', { name: 'Rename' })[0];

  expect(pencil?.className).toContain('hidden');
  expect(pencil?.className).toContain('group-hover:inline-flex');
});

/**
 * The width budget is the name's, not the tab's: cut as a whole, a tab with a long name would lose
 * its pencil and trash over the edge.
 */
it('cuts a long name before its pencil and trash, not around them', async () => {
  const long = 'the overworld after dark';
  await render(TabsComponent, {
    inputs: {
      tabs: [{ value: 'a', label: long }, ...tabs],
      value: 'a',
      variant: 'small',
      editable: true,
      removable: true,
    },
  });
  const tab = screen.getByRole('tab', { name: long });
  const name = tab.querySelector('.truncate');

  expect(tab.className).not.toContain('overflow-hidden');
  expect(name?.textContent).toBe(long);
  expect(name?.className).toContain('max-w-[14ch]');
  expect(within(tab).getByRole('button', { name: 'Rename' })).toBeInTheDocument();
  expect(within(tab).getByRole('button', { name: 'Remove' })).toBeInTheDocument();
});

it('offers no trash on the last tab, since a list of none is nothing to choose from', async () => {
  await render(TabsComponent, {
    inputs: { tabs: tabs.slice(0, 1), value: 'account', variant: 'small', removable: true },
  });

  expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
});

it('lets the keyboard reach the trash of a tab, rather than taking its keys for the tab', async () => {
  const remove = vi.fn();
  await render(TabsComponent, {
    inputs: { tabs, value: 'account', variant: 'small', removable: true },
    on: { remove },
  });

  const trash = within(screen.getByRole('tab', { name: 'Editor' })).getByRole('button', {
    name: 'Remove',
  });
  trash.focus();
  await userEvent.keyboard('{Enter}');
  expect(remove).toHaveBeenCalledWith('editor');
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
    // The actions slot is the strip's, not the tabs': inside the scroller it would slide away with
    // them.
    expect(list.querySelector('.flex-1')).toBeNull();
    expect(list.className).toContain('overflow-x-auto');
  });
});
