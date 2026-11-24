import type { ActionInput } from '@naucto/engine';
import { render, screen } from '@testing-library/angular';

import { testProviders } from '../../testing/providers';
import { InputCapComponent } from './input-cap.component';

const cap = async (input: ActionInput): Promise<HTMLElement> => {
  const { container } = await render(InputCapComponent, {
    providers: testProviders(),
    inputs: { input },
  });

  return container;
};

it('engraves a letter as the key has it', async () => {
  await cap({ kind: 'key', player: 0, key: 'q' });
  expect(screen.getByText('q')).toBeInTheDocument();
});

it('writes out a key whose name is not what it says on it', async () => {
  await cap({ kind: 'key', player: 0, key: ' ' });
  expect(screen.getByText('Space')).toBeInTheDocument();
});

it('draws an arrow key with the kit mark, and says its direction', async () => {
  const container = await cap({ kind: 'key', player: 1, key: 'ArrowLeft' });
  expect(container.querySelector('nc-mark svg')).not.toBeNull();
  expect(container.textContent).not.toMatch(/[←→↑↓]|ArrowLeft/);
  expect(screen.getByText('left')).toHaveClass('sr-only');
});

it('draws a D-pad direction as the cross key, and names it', async () => {
  const container = await cap({ kind: 'pad', control: 'dpad-left' });
  expect(container.querySelector('nc-keycap')).toBeNull();
  expect(container.querySelector('nc-pad-cap svg')).toHaveAttribute('viewBox', '0 0 13 14');
  expect(screen.getByText('D-pad left')).toHaveClass('sr-only');
});

it('draws a stick direction as the stick, and names it', async () => {
  const container = await cap({ kind: 'pad', control: 'stick-up' });
  expect(container.querySelector('nc-keycap')).toBeNull();
  expect(container.querySelector('nc-pad-cap svg')).toHaveAttribute('viewBox', '0 0 13 12');
  expect(screen.getByText('Stick up')).toHaveClass('sr-only');
});

it('engraves a face button and a shoulder as the pad has them', async () => {
  await cap({ kind: 'pad', control: 'rb' });
  expect(screen.getByText('RB')).toBeInTheDocument();
});
