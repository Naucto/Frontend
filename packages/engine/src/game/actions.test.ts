import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { type ActionInput, MAX_ACTIONS } from '../input/actions';
import { INPUT_PRESETS } from '../input/presets';
import { EditableGame } from './EditableGame';
import { Game } from './Game';
import { KEYS } from './keys';

const SPACE: ActionInput = { kind: 'key', player: 0, key: ' ' };
const PAD_A: ActionInput = { kind: 'pad', control: 'a' };

const emptyGame = (): EditableGame => new EditableGame(new Y.Doc());
const names = (game: Game): string[] => game.actions.map((action) => action.name);

describe('a new game', () => {
  it('starts on the classic preset, so the starter code reads actions it has', () => {
    const game = emptyGame();
    game.seedDefaults();

    expect(names(game)).toEqual(INPUT_PRESETS.classic.map((draft) => draft.name));
    expect(game.actions[0]).toEqual({
      id: 'left',
      order: 0,
      ...INPUT_PRESETS.classic[0],
    });
  });

  it('keeps the actions its author set when it is seeded again', () => {
    const game = emptyGame();
    game.seedDefaults();
    game.applyPreset('platformer');
    game.seedDefaults();

    expect(names(game)).toEqual(INPUT_PRESETS.platformer.map((draft) => draft.name));
  });
});

describe('editing the actions of a game', () => {
  it('adds an action after the others and reads it back through a peer', () => {
    const game = emptyGame();
    const jump = game.addAction({ name: 'jump', label: ' Jump ', inputs: [SPACE, PAD_A] });
    const dash = game.addAction({ name: 'dash' });

    expect(jump).not.toBeNull();
    expect(game.actions).toEqual([
      { id: jump, name: 'jump', label: 'Jump', description: '', order: 0, inputs: [SPACE, PAD_A] },
      { id: dash, name: 'dash', label: 'dash', description: '', order: 1, inputs: [] },
    ]);

    const remote = new Y.Doc();
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(game.doc));
    expect(new Game(remote).actions).toEqual(game.actions);
  });

  it('refuses a name that cannot be one, and one another action has', () => {
    const game = emptyGame();
    game.addAction({ name: 'jump' });

    expect(game.addAction({ name: 'Jump' })).toBeNull();
    expect(game.addAction({ name: 'jump' })).toBeNull();
    expect(game.actionNameIssue('jump')).toBe('taken');
    expect(game.actionNameIssue('jump', game.actions[0]?.id)).toBeNull();
    expect(game.actionNameIssue('run fast')).toBe('format');
    expect(names(game)).toEqual(['jump']);
  });

  it('holds thirty-two actions and refuses the next', () => {
    const game = emptyGame();
    for (let i = 0; i < MAX_ACTIONS; i++) {
      expect(game.addAction({ name: `action_${String(i)}` })).not.toBeNull();
    }

    expect(game.addAction({ name: 'one_too_many' })).toBeNull();
    expect(game.actions).toHaveLength(MAX_ACTIONS);
  });

  it('renames, relabels and describes an action, one field at a time', () => {
    const game = emptyGame();
    const id = game.addAction({ name: 'jump', label: 'Jump' }) ?? '';
    game.addAction({ name: 'dash' });

    expect(game.updateAction(id, { description: `  ${'x'.repeat(80)}` })).toBe(true);
    expect(game.actions[0]).toMatchObject({ name: 'jump', label: 'Jump' });
    expect(game.actions[0]?.description).toBe('x'.repeat(60));

    expect(game.updateAction(id, { name: 'hop', label: 'L'.repeat(40) })).toBe(true);
    expect(game.actions[0]).toMatchObject({ id, name: 'hop', label: 'L'.repeat(25) });

    expect(game.updateAction(id, { name: 'dash', label: 'Dash' })).toBe(false);
    expect(game.updateAction(id, { name: 'hop' })).toBe(true);
    expect(game.updateAction('nobody', { label: 'x' })).toBe(false);
    expect(game.actions[0]).toMatchObject({ name: 'hop', label: 'L'.repeat(25) });
  });

  it('removes and reorders actions', () => {
    const game = emptyGame();
    const ids = ['a', 'b', 'c', 'd'].map((name) => game.addAction({ name }) ?? '');

    game.removeAction(ids[1] ?? '');
    expect(names(game)).toEqual(['a', 'c', 'd']);

    game.reorderActions([ids[3] ?? '', ids[0] ?? '']);
    expect(names(game)).toEqual(['d', 'a', 'c']);
    expect(game.actions.map((action) => action.order)).toEqual([0, 1, 2]);
  });

  it('plugs an input once, after the ones there are, and unplugs it', () => {
    const game = emptyGame();
    const id = game.addAction({ name: 'jump', inputs: [PAD_A] }) ?? '';

    game.plugInput(id, SPACE);
    game.plugInput(id, { kind: 'key', player: 0, key: 'W' });
    game.plugInput(id, SPACE);
    expect(game.actions[0]?.inputs).toEqual([PAD_A, SPACE, { kind: 'key', player: 0, key: 'w' }]);

    game.unplugInput(id, PAD_A);
    game.unplugInput(id, { kind: 'key', player: 1, key: ' ' });
    expect(game.actions[0]?.inputs).toEqual([SPACE, { kind: 'key', player: 0, key: 'w' }]);

    game.plugInput('nobody', SPACE);
    expect(game.actions).toHaveLength(1);
  });

  it('keeps both inputs two peers plug into one action at once', () => {
    const game = emptyGame();
    const id = game.addAction({ name: 'jump' }) ?? '';
    const peer = new EditableGame(new Y.Doc());
    Y.applyUpdate(peer.doc, Y.encodeStateAsUpdate(game.doc));

    game.plugInput(id, SPACE);
    peer.plugInput(id, PAD_A);
    Y.applyUpdate(peer.doc, Y.encodeStateAsUpdate(game.doc));
    Y.applyUpdate(game.doc, Y.encodeStateAsUpdate(peer.doc));

    expect(game.actions[0]?.inputs).toHaveLength(2);
    expect(peer.actions).toEqual(game.actions);
  });

  it('replaces every action with a preset', () => {
    const game = emptyGame();
    game.addAction({ name: 'mine' });

    game.applyPreset('top-down');
    expect(
      game.actions.map(({ name, label, description, inputs }) => ({
        name,
        label,
        description,
        inputs,
      })),
    ).toEqual(INPUT_PRESETS['top-down']);

    game.applyPreset('classic');
    expect(names(game)).toEqual(INPUT_PRESETS.classic.map((draft) => draft.name));
  });

  it('tells its listeners of every change, a peer included, and reads the new list at once', () => {
    const game = emptyGame();
    const seen: string[][] = [];
    game.onActionsChange(() => seen.push(names(game)));

    const id = game.addAction({ name: 'jump' }) ?? '';
    game.plugInput(id, SPACE);
    game.updateAction(id, { name: 'hop' });
    const peer = new EditableGame(new Y.Doc());
    Y.applyUpdate(peer.doc, Y.encodeStateAsUpdate(game.doc));
    peer.removeAction(id);
    Y.applyUpdate(game.doc, Y.encodeStateAsUpdate(peer.doc));

    expect(seen).toEqual([['jump'], ['jump'], ['hop'], []]);
  });

  it('puts the actions of a saved version back', () => {
    const game = emptyGame();
    game.applyPreset('platformer');
    const saved = Y.encodeStateAsUpdate(game.doc);
    const before = game.actions;

    game.applyPreset('classic');
    game.removeAction('left');
    game.plugInput('right', SPACE);
    game.restoreFrom(saved);

    expect(game.actions).toEqual(before);
  });
});

describe('reading actions a document states badly', () => {
  const entry = (
    fields: Record<string, unknown>,
    inputs?: Record<string, unknown>,
  ): Y.Map<unknown> => {
    const map = new Y.Map<unknown>(Object.entries(fields));
    if (inputs) {
      map.set('inputs', new Y.Map<unknown>(Object.entries(inputs)));
    }

    return map;
  };

  it('leaves out what is not an action and what is not an input', () => {
    const doc = new Y.Doc();
    const root = doc.getMap<unknown>(KEYS.actions);
    root.set(
      '1',
      entry(
        { name: 'jump', order: 0, label: 7 },
        { 'key:0:A': 1, 'key:0:a': 0, 'pad:l3': 2, bogus: 3, 'pad:a': 'first' },
      ),
    );
    root.set('2', entry({ name: 'Bad Name', order: 1 }));
    root.set('3', entry({ name: 'jump', order: 2, label: 'Twin' }));
    root.set('4', entry({ order: 3 }));
    root.set('5', 'not an entry');
    root.set('6', entry({ name: 'dash', order: 4, label: '   ', description: 9, inputs: 'none' }));

    expect(new Game(doc).actions).toEqual([
      {
        id: '1',
        name: 'jump',
        label: 'jump',
        description: '',
        order: 0,
        inputs: [{ kind: 'key', player: 0, key: 'a' }, PAD_A],
      },
      { id: '6', name: 'dash', label: 'dash', description: '', order: 4, inputs: [] },
    ]);
  });

  it('reads no more actions than the masks have bits', () => {
    const doc = new Y.Doc();
    const root = doc.getMap<unknown>(KEYS.actions);
    for (let i = 0; i < MAX_ACTIONS + 5; i++) {
      root.set(String(i).padStart(2, '0'), entry({ name: `action_${String(i)}`, order: i }));
    }

    const actions = new Game(doc).actions;
    expect(actions).toHaveLength(MAX_ACTIONS);
    expect(actions.at(-1)?.name).toBe('action_31');
  });
});
