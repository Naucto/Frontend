import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { DisclosureComponent } from './disclosure.component';

describe('DisclosureComponent', () => {
  it('shows and hides what is under its title, and says so', async () => {
    const { fixture } = await render(
      `<nc-disclosure title="Details"><p>Hidden words</p></nc-disclosure>`,
      { imports: [DisclosureComponent] },
    );
    const title = screen.getByRole('button', { name: 'Details' });
    const region = document.getElementById(title.getAttribute('aria-controls') ?? '');
    expect(region).not.toBeNull();
    expect(title).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Hidden words')).not.toBeVisible();

    await userEvent.click(title);
    await fixture.whenStable();
    expect(title).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Hidden words')).toBeVisible();
  });

  it('stands as a heading of the level it is given', async () => {
    await render(
      `<nc-disclosure title="How to play" variant="title" [level]="2" [open]="true" />`,
      { imports: [DisclosureComponent] },
    );
    expect(screen.getByRole('heading', { level: 2, name: 'How to play' })).toBeTruthy();
  });
});
