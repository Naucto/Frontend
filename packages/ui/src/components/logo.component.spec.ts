import { render } from '@testing-library/angular';

import { LogoComponent } from './logo.component';

describe('LogoComponent', () => {
  it('draws the square mark unless asked for the name', async () => {
    const { container } = await render(LogoComponent, { inputs: { size: 24 } });
    const svg = container.querySelector('svg');

    expect(svg).toHaveAttribute('viewBox', '0 0 480 480');
    expect(svg).toHaveAttribute('width', '24');
    expect(svg).toHaveAttribute('height', '24');
  });

  it('sizes the wordmark by its height and leaves the width to its outline', async () => {
    const { container } = await render(LogoComponent, {
      inputs: { variant: 'wordmark', size: 21 },
    });
    const svg = container.querySelector('svg');

    expect(svg).toHaveAttribute('height', '21');
    expect(svg).not.toHaveAttribute('width');
    expect(svg?.querySelectorAll('path')).toHaveLength(2);
  });
});
