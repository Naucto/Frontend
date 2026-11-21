import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { PagerComponent } from './pager.component';

const selected = (): string | null | undefined =>
  screen
    .getAllByRole('tab')
    .find((dot) => dot.getAttribute('aria-selected') === 'true')
    ?.getAttribute('aria-label');

describe('PagerComponent', () => {
  it('draws one dot per page and marks the current one', async () => {
    await render(PagerComponent, { inputs: { count: 5, value: 2 } });
    expect(screen.getAllByRole('tab')).toHaveLength(5);
    expect(selected()).toBe('Page 3');
  });

  it('wraps around on both arrows', async () => {
    await render(PagerComponent, { inputs: { count: 3, value: 0 } });

    await userEvent.click(screen.getByRole('button', { name: 'Previous page' }));
    expect(selected()).toBe('Page 3');

    await userEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(selected()).toBe('Page 1');
  });

  it('goes to the page whose dot is pressed', async () => {
    await render(PagerComponent, { inputs: { count: 4, value: 0 } });
    await userEvent.click(screen.getByRole('tab', { name: 'Page 4' }));
    expect(selected()).toBe('Page 4');
  });
});

describe('PagerComponent on autoplay', () => {
  /** The one animation a pager runs, as the fill's own `animate` would hand it back. */
  let run: {
    onfinish: (() => void) | null;
    pause: () => void;
    play: () => void;
    cancel: () => void;
  };
  let started: number;

  beforeEach(() => {
    started = 0;
    HTMLElement.prototype.animate = function animate(): Animation {
      started += 1;
      run = { onfinish: null, pause: vi.fn(), play: vi.fn(), cancel: vi.fn() };
      return run as unknown as Animation;
    };
  });

  afterEach(() => {
    delete (HTMLElement.prototype as { animate?: unknown }).animate;
  });

  it('moves on when the fill is full, and starts the next one', async () => {
    const { fixture } = await render(PagerComponent, {
      inputs: { count: 3, value: 2, autoplay: 5000 },
    });
    expect(started).toBe(1);

    run.onfinish?.();
    await fixture.whenStable();
    expect(selected()).toBe('Page 1');
    expect(started).toBe(2);
  });

  it('holds the fill while the pointer is on the pager', async () => {
    const { fixture } = await render(PagerComponent, {
      inputs: { count: 3, value: 0, autoplay: 5000 },
    });

    await userEvent.hover(fixture.nativeElement as HTMLElement);
    await fixture.whenStable();
    expect(run.pause).toHaveBeenCalled();
  });

  it('runs nothing without a duration', async () => {
    await render(PagerComponent, { inputs: { count: 3, value: 0 } });
    expect(started).toBe(0);
  });
});
