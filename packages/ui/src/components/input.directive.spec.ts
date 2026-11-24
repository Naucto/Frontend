import { Component, signal } from '@angular/core';
import { render, screen } from '@testing-library/angular';

import { InputDirective } from './input.directive';

@Component({
  imports: [InputDirective],
  template: `
    <input ncInput aria-label="Name" [disabled]="locked()" />
    <textarea ncInput aria-label="About" disabled></textarea>
    <select ncInput aria-label="Kind"></select>
  `,
})
class Host {
  readonly locked = signal(true);
}

describe('InputDirective', () => {
  it('is disabled by a binding as by the attribute, and follows the binding', async () => {
    const { fixture } = await render(Host);

    expect(screen.getByRole('textbox', { name: 'Name' })).toBeDisabled();
    expect(screen.getByRole('textbox', { name: 'About' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Kind' })).toBeEnabled();

    fixture.componentInstance.locked.set(false);
    fixture.detectChanges();
    expect(screen.getByRole('textbox', { name: 'Name' })).toBeEnabled();
  });
});
