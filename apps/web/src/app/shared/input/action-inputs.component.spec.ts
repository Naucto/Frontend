import type { ActionInput } from '@naucto/engine';
import { render, screen } from '@testing-library/angular';

import { testProviders } from '../../testing/providers';
import { ActionInputsComponent, usesTwoKeyboards } from './action-inputs.component';

const INPUTS: ActionInput[] = [
  { kind: 'key', player: 0, key: ' ' },
  { kind: 'pad', control: 'a' },
  { kind: 'key', player: 1, key: 'n' },
  { kind: 'key', player: 0, key: 'x' },
];

it('writes the keys of one device as alternatives, a line per device', async () => {
  const { fixture } = await render(ActionInputsComponent, {
    providers: testProviders(),
    inputs: { inputs: INPUTS, twoKeyboards: true },
  });

  const lines = [...(fixture.nativeElement as HTMLElement).children].map((line) =>
    (line.textContent ?? '').replace(/\s+/g, ' ').trim(),
  );
  expect(lines).toEqual(['Player 1 Space or x', 'Player 2 n', 'Gamepad A']);
});

it('does not say whose the keys are in a game played on one layout', async () => {
  await render(ActionInputsComponent, {
    providers: testProviders(),
    inputs: { inputs: INPUTS.filter((input) => input.kind !== 'key' || input.player === 0) },
  });

  expect(screen.queryByText('Player 1')).toBeNull();
  expect(screen.getByText('or')).toBeInTheDocument();
});

it('knows a game with keys for a second player', () => {
  expect(usesTwoKeyboards([{ inputs: INPUTS }])).toBe(true);
  expect(usesTwoKeyboards([{ inputs: [INPUTS[0]!, INPUTS[1]!] }])).toBe(false);
});
