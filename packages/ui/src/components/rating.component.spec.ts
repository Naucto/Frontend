import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { RatingComponent } from './rating.component';

describe('RatingComponent', () => {
  it('offers ten scores and keeps the one picked', async () => {
    const { fixture } = await render(RatingComponent, { inputs: { label: 'Score' } });

    expect(screen.getAllByRole('radio')).toHaveLength(10);
    await userEvent.click(screen.getByRole('radio', { name: '7' }));

    expect(fixture.componentInstance.value()).toBe(7);
    expect(screen.getByRole('radio', { name: '7' })).toHaveAttribute('aria-checked', 'true');
  });

  it('moves the score with the arrow keys, and stops at either end', async () => {
    const { fixture } = await render(RatingComponent, { inputs: { label: 'Score', value: 9 } });

    screen.getByRole('radio', { name: '9' }).focus();
    await userEvent.keyboard('{ArrowRight}{ArrowRight}');
    expect(fixture.componentInstance.value()).toBe(10);
    expect(screen.getByRole('radio', { name: '10' })).toHaveFocus();

    await userEvent.keyboard('{Home}');
    expect(fixture.componentInstance.value()).toBe(1);
  });

  it('is one tab stop: the chosen score, or the first while none is', async () => {
    await render(RatingComponent, { inputs: { label: 'Score' } });

    const focusable = screen.getAllByRole('radio').filter((cell) => cell.tabIndex === 0);
    expect(focusable.map((cell) => cell.textContent?.trim())).toEqual(['1']);
  });
});
