import { Component } from '@angular/core';
import { render, screen } from '@testing-library/angular';

import { ButtonDirective } from './button.directive';

@Component({
  imports: [ButtonDirective],
  template: `
    <button ncButton variant="primary">Publish</button>
    <button ncButton variant="danger" size="sm" iconOnly aria-label="Delete">x</button>
  `,
})
class Host {}

describe('ButtonDirective', () => {
  it('applies variant classes and data attribute', async () => {
    await render(Host);
    const primary = screen.getByRole('button', { name: 'Publish' });
    expect(primary).toHaveAttribute('data-variant', 'primary');
    expect(primary.className).toContain('bg-gold');
    const danger = screen.getByRole('button', { name: 'Delete' });
    expect(danger.className).toContain('aspect-square');
    expect(danger.className).toContain('h-[24px]');
  });
});
