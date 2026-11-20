import { Component } from '@angular/core';
import { render, screen } from '@testing-library/angular';

import { OptionDirective } from './option.directive';
import { SuggestRowComponent } from './suggest-row.component';

@Component({
  selector: 'nc-option-host',
  imports: [OptionDirective, SuggestRowComponent],
  template: `
    <button type="button" ncOption shape="menu">Settings</button>
    <button type="button" ncOption wash="sky">theo joined</button>
    <nc-suggest-row [selected]="true">Hightide</nc-suggest-row>
    <nc-suggest-row>Starline</nc-suggest-row>
  `,
})
class HostComponent {}

describe('OptionDirective', () => {
  it('has no frame until it is hovered, then lights and can be pressed', async () => {
    await render(HostComponent);
    expect(screen.getByRole('button', { name: 'Settings' })).toHaveClass(
      'raised-sm',
      'bevel-bare',
      'hover:bevel-lit',
      'hover:text-active-ink',
      'active:bevel-down',
    );
  });

  it('washes a row only where one is asked for', async () => {
    await render(HostComponent);
    expect(screen.getByRole('button', { name: 'theo joined' })).toHaveClass('before:bg-wash-sky');
    expect(screen.getByRole('button', { name: 'Settings' }).className).not.toContain('before:');
  });

  /** A suggestion is the same row: the keyboard being on it is the lit state, said to the reader. */
  it('lights the suggestion the keyboard is on', async () => {
    await render(HostComponent);
    const on = screen.getByRole('option', { name: 'Hightide' });
    const off = screen.getByRole('option', { name: 'Starline' });

    expect(on).toHaveAttribute('aria-selected', 'true');
    expect(on).toHaveClass('bevel-lit', 'text-active-ink', 'items-center');
    expect(off).toHaveAttribute('aria-selected', 'false');
    expect(off).not.toHaveClass('bevel-lit');
    expect(off).toHaveClass('raised-sm', 'items-center');
  });
});
