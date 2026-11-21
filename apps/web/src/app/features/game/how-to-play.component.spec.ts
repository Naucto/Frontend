import { EditableGame } from '@naucto/engine';
import { render, screen } from '@testing-library/angular';
import * as Y from 'yjs';

import { testProviders } from '../../testing/providers';
import { HowToPlayComponent } from './how-to-play.component';

const text = (element: Element): string => (element.textContent ?? '').replace(/\s+/g, ' ').trim();

/** Each action as the panel reads: its name, then what presses it, device by device. */
const rowsOf = (container: Element): { name: string; caps: string[] }[] =>
  [...container.querySelectorAll('dl > div')].map((row) => ({
    name: text(row.querySelector('dt') ?? row),
    caps: [...row.querySelectorAll('nc-input-cap')].map(text),
  }));

it('shows what the game calls each action and what presses it', async () => {
  const game = new EditableGame(new Y.Doc());
  game.applyPreset('platformer');
  const jump = game.actions.find((action) => action.name === 'jump')?.id ?? '';
  game.updateAction(jump, { label: 'Leap' });
  game.unplugInput(jump, { kind: 'key', player: 0, key: 'w' });
  game.unplugInput(jump, { kind: 'key', player: 0, key: 'z' });

  const { container } = await render(HowToPlayComponent, {
    providers: testProviders(),
    inputs: { actions: game.actions },
  });

  const rows = rowsOf(container);
  expect(rows.map((row) => row.name)).toEqual([
    'Move left',
    'Move right',
    'Leap',
    'Dash',
    'Crouch',
    'Interact',
    'Pause',
  ]);
  expect(rows[2]?.caps).toEqual(['Space', 'up', 'A']);
  expect(rows[6]?.caps).toEqual(['Esc', 'Enter', 'Start']);
  expect(screen.getByText('Hold to jump higher')).toBeInTheDocument();
  expect(screen.queryByText('Player 1')).toBeNull();
});

it('tells the two players apart in a game that has keys for both', async () => {
  const game = new EditableGame(new Y.Doc());
  game.applyPreset('two-players');

  const { container } = await render(HowToPlayComponent, {
    providers: testProviders(),
    inputs: { actions: game.actions },
  });

  expect(rowsOf(container)[0]).toEqual({
    name: 'Left',
    caps: ['a', 'q', 'left', 'D-pad left', 'Stick left'],
  });
  expect(screen.getAllByText('Player 1')).toHaveLength(6);
  expect(screen.getAllByText('Player 2')).toHaveLength(6);
});
