import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { testProviders } from '../../testing/providers';
import { ControlsSettingsComponent } from './controls-settings.component';

it('backs out of a gamepad capture on Escape, with no pad needed', async () => {
  await render(ControlsSettingsComponent, { providers: testProviders() });

  const [rebind] = screen.getAllByRole('button', { name: 'Rebind the gamepad button' });
  await userEvent.click(rebind!);
  expect(screen.getByText('Escape cancels')).toBeInTheDocument();

  await userEvent.keyboard('{Escape}');
  expect(screen.queryByText('Escape cancels')).toBeNull();
});
