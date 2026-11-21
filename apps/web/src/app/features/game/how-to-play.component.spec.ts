import { EditableGame } from '@naucto/engine';
import { render, type RenderResult, screen, within } from '@testing-library/angular';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

import { installMemoryStorage } from '../../testing/memory-storage';
import { testProviders } from '../../testing/providers';
import { HowToPlayComponent } from './how-to-play.component';

/** What an element says, a space between two pieces that stand apart on screen. */
const text = (element: Element): string => {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const pieces: string[] = [];
  while (walker.nextNode()) {
    pieces.push((walker.currentNode.textContent ?? '').replace(/\s+/g, ' ').trim());
  }

  return pieces.filter(Boolean).join(' ');
};

/** Each table as it reads: its column heads, then every row cell by cell. */
const tablesOf = (): string[][][] =>
  screen.queryAllByRole('table').map((table) =>
    within(table)
      .getAllByRole('row')
      .map((row) => [...row.children].map(text)),
  );

const gameOf = (preset: 'platformer' | 'two-players'): EditableGame => {
  const game = new EditableGame(new Y.Doc());
  game.applyPreset(preset);

  return game;
};

const show = (game: EditableGame): Promise<RenderResult<HowToPlayComponent>> =>
  render(HowToPlayComponent, { providers: testProviders(), inputs: { actions: game.actions } });

let coarse = false;

beforeEach(() => {
  coarse = false;
  installMemoryStorage();
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: coarse && query.includes('coarse') }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it('lists the actions of a game, each with its keys and its gamepad controls', async () => {
  const game = gameOf('platformer');
  const jump = game.actions.find((action) => action.name === 'jump')?.id ?? '';
  game.updateAction(jump, { label: 'Leap' });
  game.unplugInput(jump, { kind: 'key', player: 0, key: 'w' });
  game.unplugInput(jump, { kind: 'key', player: 0, key: 'z' });

  await show(game);

  expect(tablesOf()).toEqual([
    [
      ['Action', 'Keys', 'Pad'],
      ['Move left', 'left or a or q', 'D-pad left or Stick left'],
      ['Move right', 'right or d', 'D-pad right or Stick right'],
      ['Leap Hold to jump higher', 'Space or up', 'A'],
      ['Dash Hold to run', 'Shift or x', 'X'],
    ],
    [
      ['Action', 'Keys', 'Pad'],
      ['Crouch', 'down or s', 'D-pad down or Stick down'],
      ['Interact Doors, signs and switches', 'e', 'B'],
      ['Pause', 'Esc or Enter', 'Start'],
    ],
  ]);
});

it('names a row by its label alone when the game describes nothing', async () => {
  await show(gameOf('platformer'));

  const crouch = screen.getByRole('rowheader', { name: 'Crouch' });
  expect(crouch.querySelector('small')).toBeNull();
  expect(screen.getByRole('rowheader', { name: /Dash/ }).querySelector('small')).toHaveTextContent(
    'Hold to run',
  );
});

it('keeps four actions or fewer in one table', async () => {
  const game = gameOf('platformer');
  for (const action of game.actions.slice(4)) {
    game.removeAction(action.id);
  }

  await show(game);

  expect(tablesOf()).toHaveLength(1);
});

it('gives each keyboard player a column in a game that has keys for two', async () => {
  await show(gameOf('two-players'));

  const [first] = tablesOf();
  expect(first?.[0]).toEqual(['Action', 'P1 Keys', 'P2 Keys', 'Pad']);
  expect(first?.[1]).toEqual(['Left', 'a or q', 'left', 'D-pad left or Stick left']);
});

it('shows the control of the on-screen pad, and nothing else, on a touch device', async () => {
  coarse = true;
  const game = gameOf('platformer');
  const dash = game.actions.find((action) => action.name === 'dash')?.id ?? '';
  game.unplugInput(dash, { kind: 'pad', control: 'x' });
  game.plugInput(dash, { kind: 'pad', control: 'rb' });

  await show(game);

  const [first] = tablesOf();
  expect(first).toEqual([
    ['Action', 'Touch'],
    ['Move left', 'D-pad left'],
    ['Move right', 'D-pad right'],
    ['Jump Hold to jump higher', 'A'],
    ['Dash Hold to run', 'Not on touch'],
  ]);
});

it('folds away, and says so to the device', async () => {
  const { fixture } = await show(gameOf('platformer'));
  const fold = screen.getByRole('button', { name: 'Hide how to play' });
  expect(fold).toHaveAttribute('aria-expanded', 'true');

  fold.click();
  fixture.detectChanges();
  expect(screen.queryByRole('table')).toBeNull();
  expect(screen.getByRole('button', { name: 'Show how to play' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  expect(localStorage.getItem('naucto.how-to-play-open')).toBe('false');
});

it('stays folded on a device that left it so', async () => {
  localStorage.setItem('naucto.how-to-play-open', 'false');

  await show(gameOf('platformer'));

  expect(screen.queryByRole('table')).toBeNull();
  expect(screen.getByRole('heading', { name: 'How to play' })).toBeInTheDocument();
});
