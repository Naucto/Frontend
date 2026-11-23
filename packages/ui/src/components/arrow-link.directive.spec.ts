import { Component } from '@angular/core';
import { provideRouter, RouterLink } from '@angular/router';
import { render, screen } from '@testing-library/angular';

import { ArrowLinkDirective } from './arrow-link.directive';

@Component({
  imports: [ArrowLinkDirective, RouterLink],
  template: `
    <a ncArrowLink routerLink="/u/louis">View profile</a>
  `,
})
class Host {}

describe('ArrowLinkDirective', () => {
  it('keeps the routed address and the words of the link it styles', async () => {
    await render(Host, { providers: [provideRouter([])] });
    const link = screen.getByRole('link', { name: 'View profile' });
    expect(link).toHaveAttribute('href', '/u/louis');
    expect(link.className.split(' ')).toEqual(
      expect.arrayContaining(['text-gold-ink', 'text-label', 'tracking-wide', 'uppercase']),
    );
  });

  it('draws the arrow after the words from the five-pixel drawing', async () => {
    await render(Host, { providers: [provideRouter([])] });
    const link = screen.getByRole('link');
    expect(link.className).toContain('after:[mask-image:var(--nc-arrow)]');
    expect(link.style.getPropertyValue('--nc-arrow')).toContain(
      'M1 0h4v1H1zM4 1h1v3H4zM3 1h1v1H3zM2 2h1v1H2zM1 3h1v1H1zM0 4h1v1H0z',
    );
  });
});
