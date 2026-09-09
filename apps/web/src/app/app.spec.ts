import { render } from '@testing-library/angular';

import { App } from './app';
import { testProviders } from './testing/providers';

describe('App', () => {
  it('renders a router outlet, and reports from the overlay container', async () => {
    const { container } = await render(App, { providers: testProviders() });
    expect(container.querySelector('router-outlet')).not.toBeNull();
    // The host relocates itself on construction, so it is not in the fixture it was rendered into.
    expect(document.querySelector('.cdk-overlay-container nc-toast-host')).not.toBeNull();
  });
});
