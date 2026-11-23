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
it('draws a small strip in ordinary sentence case', async () => {
  await render(TabsComponent, { inputs: { tabs, value: 'account', variant: 'small' } });

  expect(screen.getByRole('tab', { name: 'Account' }).className).not.toContain('uppercase');
});

/** One tab is the frame that opens into what it chooses; the others stand a pixel off the rule. */
it('opens the chosen tab through the rule and leaves the others on it', async () => {
  await render(TabsComponent, { inputs: { tabs, value: 'account' } });
  const chosen = screen.getByRole('tab', { name: 'Account' });
  const idle = screen.getByRole('tab', { name: 'Editor' });

  expect(chosen).toHaveClass('bevel-open-b', 'bevel-hi-active-ink', 'bevel-fill-raised');
  expect(chosen).not.toHaveClass('mb-[3px]');
  expect(idle).toHaveClass(
    'bevel-open-b',
    'bevel-fill-panel',
    'mb-[3px]',
    'not-aria-disabled:hover:h-[37px]',
  );
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

/** A disabled strip is read and nothing else: no tab is chosen, renamed, removed or dragged. */
it('chooses nothing and offers no pencil or trash when disabled', async () => {
  const edit = vi.fn();
  const { fixture } = await render(TabsComponent, {
    inputs: { tabs, value: 'account', editable: true, removable: true, disabled: true },
    on: { edit },
  });
  const idle = screen.getByRole('tab', { name: 'Editor' });

  await userEvent.click(idle);
  await userEvent.dblClick(idle);

  expect(fixture.componentInstance.value()).toBe('account');
  expect(edit).not.toHaveBeenCalled();
  expect(idle).toHaveAttribute('aria-disabled', 'true');
  expect(idle).toHaveAttribute('tabindex', '-1');
  expect(screen.queryByRole('button', { name: 'Rename' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
});

/** The pencil and the double-click are one affordance: a strip that offers no rename has neither. */
it('renames on a double-click only where the strip is editable', async () => {
  const edit = vi.fn();
  const { rerender } = await render(TabsComponent, {
    inputs: { tabs, value: 'account' },
    on: { edit },
  });

  await userEvent.dblClick(screen.getByRole('tab', { name: 'Editor' }));
  expect(edit).not.toHaveBeenCalled();

  await rerender({ inputs: { tabs, value: 'account', editable: true }, on: { edit } });
  await userEvent.dblClick(screen.getByRole('tab', { name: 'Editor' }));
  expect(edit).toHaveBeenCalledWith('editor');
});
