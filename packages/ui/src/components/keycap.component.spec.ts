import { render, screen } from '@testing-library/angular';

import { KeycapComponent } from './keycap.component';

describe('KeycapComponent', () => {
  it('draws its edge in the key colour unless it is waiting', async () => {
    await render(
      '<nc-keycap>Esc</nc-keycap><nc-keycap waiting aria-label="Waiting">...</nc-keycap>',
      { imports: [KeycapComponent] },
    );
    expect(screen.getByText('Esc').className).toContain('bevel-edge-key-edge');
    expect(screen.getByLabelText('Waiting').className).toContain('bevel-edge-gold');
    expect(screen.getByLabelText('Waiting').className).not.toContain('bevel-edge-key-edge');
  });
});
