import { Component, signal } from '@angular/core';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { SelectComponent, type SelectOption } from './select.component';

type Fruit = 'apple' | 'apricot' | 'banana' | 'cherry';

const FRUITS: SelectOption<Fruit>[] = [
  { value: 'apple', label: 'Apple' },
  { value: 'apricot', label: 'Apricot' },
  { value: 'banana', label: 'Banana' },
  { value: 'cherry', label: 'Cherry' },
];

@Component({
  imports: [SelectComponent],
  template: `
    <label for="fruit">Fruit</label>
    <nc-select
      inputId="fruit"
      placeholder="Pick one"
      [options]="options"
      [(value)]="value"
      [disabled]="disabled()" />
  `,
})
class HostComponent {
  readonly options = FRUITS;
  readonly value = signal<Fruit | undefined>('banana');
  readonly disabled = signal(false);
}

/** The list lives in an overlay outside the fixture, so ask the document. */
const listbox = (): HTMLElement | null => document.querySelector('[role="listbox"]');

async function setup(): Promise<{ host: HostComponent; field: HTMLElement }> {
  const { fixture } = await render(HostComponent);
  return {
    host: fixture.componentInstance,
    field: screen.getByRole('combobox', { name: 'Fruit' }),
  };
}

describe('SelectComponent', () => {
  it('shows the chosen option, named by its label', async () => {
    const { field } = await setup();
    expect(field).toHaveTextContent('Banana');
    expect(field).toHaveAttribute('aria-expanded', 'false');
    expect(field).toHaveAttribute('aria-haspopup', 'listbox');
  });

  it('opens on a click and takes the option clicked', async () => {
    const { host, field } = await setup();
    await userEvent.click(field);
    expect(field).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('option', { name: 'Banana' })).toHaveAttribute('aria-selected', 'true');
    await userEvent.click(screen.getByRole('option', { name: 'Cherry' }));
    expect(host.value()).toBe('cherry');
    expect(listbox()).toBeNull();
  });

  it('moves with the arrows from the chosen option and takes it on Enter', async () => {
    const { host, field } = await setup();
    field.focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(listbox()).not.toBeNull();
    const active = (): string | null =>
      document.getElementById(field.getAttribute('aria-activedescendant') ?? '')?.textContent ??
      null;
    await Promise.resolve();
    expect(active()).toContain('Banana');
    await userEvent.keyboard('{ArrowDown}');
    expect(active()).toContain('Cherry');
    await userEvent.keyboard('{ArrowDown}');
    expect(active()).toContain('Cherry');
    await userEvent.keyboard('{Home}');
    expect(active()).toContain('Apple');
    await userEvent.keyboard('{Enter}');
    expect(host.value()).toBe('apple');
    expect(listbox()).toBeNull();
    expect(field).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes on Escape without taking the option the keyboard is on', async () => {
    const { host, field } = await setup();
    field.focus();
    await userEvent.keyboard('{ArrowDown}{End}{Escape}');
    expect(listbox()).toBeNull();
    expect(host.value()).toBe('banana');
  });

  it('goes to the option a typed prefix starts, open or closed', async () => {
    const { host, field } = await setup();
    field.focus();
    await userEvent.keyboard('c');
    expect(host.value()).toBe('cherry');
    // A pause ends the prefix, as on a native select.
    await new Promise((resolve) => setTimeout(resolve, 600));
    await userEvent.keyboard('a');
    expect(host.value()).toBe('apple');
    // The same letter again steps to the next option it starts.
    await userEvent.keyboard('a');
    expect(host.value()).toBe('apricot');
    await new Promise((resolve) => setTimeout(resolve, 600));

    // Open, it only moves the keyboard: Enter takes the option.
    await userEvent.keyboard('{ArrowDown}b');
    expect(host.value()).toBe('apricot');
    await userEvent.keyboard('{Enter}');
    expect(host.value()).toBe('banana');
  });

  it('shows the placeholder while nothing is chosen', async () => {
    const { host, field } = await setup();
    host.value.set(undefined);
    await Promise.resolve();
    await screen.findByText('Pick one');
    expect(field).toHaveTextContent('Pick one');
  });

  it('neither opens nor changes while disabled', async () => {
    const { host, field } = await setup();
    host.disabled.set(true);
    await screen.findByRole('combobox', { name: 'Fruit' });
    await new Promise((resolve) => setTimeout(resolve));
    expect(field).toBeDisabled();
    await userEvent.click(field);
    expect(listbox()).toBeNull();
  });
});
