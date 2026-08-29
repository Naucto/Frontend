import { render } from '@testing-library/angular';

import { App } from './app';
import { testProviders } from './testing/providers';

describe('App', () => {
  it('renders a router outlet and the toast host', async () => {
    const { container } = await render(App, { providers: testProviders() });
    expect(container.querySelector('router-outlet')).not.toBeNull();
    expect(container.querySelector('nc-toast-host')).not.toBeNull();
  });
});
