import { Component, signal } from '@angular/core';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { SectionComponent } from './section.component';

@Component({
  imports: [SectionComponent],
  template: `
    <nc-section title="Palette" [collapsible]="collapsible()" [(open)]="open">
      <button actions type="button">Reset</button>
      <p>sixteen colours</p>
    </nc-section>
  `,
})
class Host {
  readonly collapsible = signal(true);
  readonly open = signal(true);
}

describe('nc-section', () => {
  it('folds from its heading, keeps what it holds mounted and its actions reachable', async () => {
    const { fixture } = await render(Host);
    const fold = screen.getByRole('button', { name: 'Palette' });
    expect(fold).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('sixteen colours')).toBeVisible();

    await userEvent.click(fold);
    expect(fixture.componentInstance.open()).toBe(false);
    expect(fold).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('sixteen colours')).not.toBeVisible();
    expect(screen.getByRole('button', { name: 'Reset' })).toBeVisible();

    await userEvent.click(fold);
    expect(screen.getByText('sixteen colours')).toBeVisible();
  });

  it('opens where it is told to', async () => {
    await render(Host, { componentProperties: { open: signal(false) } });
    expect(screen.getByRole('button', { name: 'Palette' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.getByText('sixteen colours')).not.toBeVisible();
  });

  it('is a plain heading unless asked to fold', async () => {
    await render(Host, { componentProperties: { collapsible: signal(false) } });
    expect(screen.queryByRole('button', { name: 'Palette' })).toBeNull();
    expect(screen.getByText('Palette')).toBeVisible();
    expect(screen.getByText('sixteen colours')).toBeVisible();
  });
});
