import { describe, expect, it } from 'vitest';

import {
  ACTION_DESCRIPTION_MAX,
  ACTION_LABEL_MAX,
  type ActionDraft,
  type ActionInput,
  actionNameIssue,
  actionsUsing,
  type GameAction,
  inputId,
  MAX_ACTIONS,
  PAD_CONTROLS,
  parseInputId,
} from './actions';
import { buildActionTable } from './ActionTable';
import { InputState } from './InputState';
import { INPUT_PRESET_IDS, INPUT_PRESETS } from './presets';
import { tableOf } from './test-table';
import { touchControlsOf, touchUnreachable } from './touch-pad';

const numbered = (drafts: readonly ActionDraft[]): GameAction[] =>
  drafts.map((draft, order) => ({ ...draft, id: draft.name, order }));

const bare = (name: string, ...inputs: ActionInput[]): ActionDraft => ({
  name,
  label: '',
  description: '',
  inputs,
});

describe('action names', () => {
  it('are lower-case words the code can write', () => {
    expect(actionNameIssue('jump')).toBeNull();
    expect(actionNameIssue('move_left2')).toBeNull();
    expect(actionNameIssue('')).toBe('empty');
    expect(actionNameIssue('Jump')).toBe('format');
    expect(actionNameIssue('2fast')).toBe('format');
    expect(actionNameIssue('move left')).toBe('format');
    expect(actionNameIssue('_jump')).toBe('format');
    expect(actionNameIssue('a'.repeat(24))).toBeNull();
    expect(actionNameIssue('a'.repeat(25))).toBe('too-long');
  });

  it('are unique in a game', () => {
    expect(actionNameIssue('jump', ['dash', 'jump'])).toBe('taken');
    expect(actionNameIssue('jump', ['dash'])).toBeNull();
  });
});

describe('input ids', () => {
  it('name an input and read back as it', () => {
    const inputs: ActionInput[] = [
      { kind: 'key', player: 0, key: 'ArrowLeft' },
      { kind: 'key', player: 1, key: ':' },
      { kind: 'key', player: 0, key: ' ' },
      ...PAD_CONTROLS.map((control): ActionInput => ({ kind: 'pad', control })),
    ];
    for (const input of inputs) {
      expect(parseInputId(inputId(input))).toEqual(input);
    }
  });

  it('take both cases of a letter for one key', () => {
    expect(inputId({ kind: 'key', player: 0, key: 'A' })).toBe('key:0:a');
    expect(parseInputId('key:1:Q')).toEqual({ kind: 'key', player: 1, key: 'q' });
  });

  it('read nothing from what names no input', () => {
    for (const id of ['', 'key:2:a', 'key:0:', 'pad:l2', 'touch:a', 'a']) {
      expect(parseInputId(id)).toBeNull();
    }
  });
});

describe('the action table', () => {
  it('gives each action a bit and each input the bits of every action it is plugged into', () => {
    const table = tableOf([
      bare('jump', { kind: 'key', player: 0, key: ' ' }, { kind: 'pad', control: 'a' }),
      bare('confirm', { kind: 'key', player: 0, key: ' ' }, { kind: 'key', player: 1, key: 'n' }),
    ]);

    expect([...table.bits]).toEqual([
      ['jump', 1],
      ['confirm', 2],
    ]);
    expect(table.keys[0].get(' ')).toBe(3);
    expect(table.keys[1].get('n')).toBe(2);
    expect(table.keys[1].has(' ')).toBe(false);
    expect(table.pad.get('a')).toBe(1);
  });

  it('holds thirty-two actions, each told apart, and none past them', () => {
    const drafts = Array.from({ length: MAX_ACTIONS + 1 }, (_, i) =>
      bare(`action_${String(i)}`, { kind: 'key', player: 0, key: `F${String(i)}` }),
    );
    const state = new InputState();
    state.setActions(tableOf(drafts));
    expect(state.actions.bits.size).toBe(MAX_ACTIONS);

    state.press(0, state.actions.keys[0].get('F31') ?? 0, true);
    state.commit();
    expect(state.btn('action_31')).toBe(true);
    expect(state.btnp('action_31')).toBe(true);
    expect(drafts.slice(0, 31).some((draft) => state.btn(draft.name))).toBe(false);
    expect(state.btn('action_32')).toBe(false);
    expect(state.actions.keys[0].has('F32')).toBe(false);

    state.press(0, state.actions.keys[0].get('F0') ?? 0, true);
    state.press(0, state.actions.keys[0].get('F31') ?? 0, false);
    state.commit();
    expect([state.btn('action_0'), state.btn('action_31'), state.btnr('action_31')]).toEqual([
      true,
      false,
      true,
    ]);
  });
});

describe('finding what an input is plugged into', () => {
  const actions = numbered([
    bare('jump', { kind: 'key', player: 0, key: ' ' }, { kind: 'pad', control: 'a' }),
    bare('confirm', { kind: 'key', player: 0, key: ' ' }),
    bare('fire', { kind: 'key', player: 1, key: ' ' }),
  ]);

  it('names the actions holding it, for that player only', () => {
    const space: ActionInput = { kind: 'key', player: 0, key: ' ' };
    expect(actionsUsing(actions, space).map((action) => action.name)).toEqual(['jump', 'confirm']);
    expect(actionsUsing(actions, space, 'jump').map((action) => action.name)).toEqual(['confirm']);
    expect(
      actionsUsing(actions, { kind: 'key', player: 1, key: ' ' }).map((action) => action.name),
    ).toEqual(['fire']);
  });

  it('finds a control whatever the pad, and nothing for an input nobody uses', () => {
    expect(
      actionsUsing(actions, { kind: 'pad', control: 'a' }).map((action) => action.name),
    ).toEqual(['jump']);
    expect(actionsUsing(actions, { kind: 'pad', control: 'b' })).toEqual([]);
  });
});

describe('the on-screen pad', () => {
  it('shows the controls a game uses, the cross standing for the left stick', () => {
    expect(touchControlsOf(numbered(INPUT_PRESETS.classic))).toEqual([
      'dpad-up',
      'dpad-down',
      'dpad-left',
      'dpad-right',
      'a',
      'b',
      'x',
      'y',
      'start',
    ]);
    expect(
      touchControlsOf(
        numbered([
          bare('steer_left', { kind: 'pad', control: 'stick-left' }),
          bare('steer_right', { kind: 'pad', control: 'stick-right' }),
          bare('boost', { kind: 'pad', control: 'x' }, { kind: 'pad', control: 'rb' }),
          bare('quit', { kind: 'key', player: 0, key: 'Escape' }),
        ]),
      ),
    ).toEqual(['dpad-left', 'dpad-right', 'x']);
    expect(touchControlsOf([])).toEqual([]);
  });

  it('lists the controls a game uses that it has no place for', () => {
    expect(touchUnreachable(numbered(INPUT_PRESETS.classic))).toEqual([]);
    expect(
      touchUnreachable(
        numbered([
          bare('strafe', { kind: 'pad', control: 'lb' }, { kind: 'pad', control: 'rb' }),
          bare('map', { kind: 'pad', control: 'select' }, { kind: 'pad', control: 'stick-up' }),
        ]),
      ),
    ).toEqual(['lb', 'rb', 'select']);
  });
});

describe('the presets', () => {
  it.each(INPUT_PRESET_IDS)('%s is a set of actions a game can hold', (id) => {
    const drafts: readonly ActionDraft[] = INPUT_PRESETS[id];
    expect(drafts.length).toBeLessThanOrEqual(MAX_ACTIONS);
    drafts.forEach((draft, i) => {
      expect(
        actionNameIssue(
          draft.name,
          drafts.slice(0, i).map((other) => other.name),
        ),
      ).toBeNull();
      expect(draft.label.length).toBeGreaterThan(0);
      expect(draft.label.length).toBeLessThanOrEqual(ACTION_LABEL_MAX);
      expect(draft.description.length).toBeLessThanOrEqual(ACTION_DESCRIPTION_MAX);
      const ids = draft.inputs.map(inputId);
      expect(new Set(ids).size).toBe(ids.length);
      expect(draft.inputs.map((input) => parseInputId(inputId(input)))).toEqual(draft.inputs);
    });
    expect(touchUnreachable(numbered(drafts))).toEqual([]);
  });

  it('classic is the nine actions and the bindings every game had', () => {
    const table = buildActionTable(numbered(INPUT_PRESETS.classic));
    expect([...table.bits.keys()]).toEqual([
      'left',
      'right',
      'up',
      'down',
      'a',
      'b',
      'x',
      'y',
      'pause',
    ]);
    const keysOf = (player: 0 | 1, name: string): string[] =>
      [...table.keys[player]]
        .filter(([, mask]) => mask === table.bits.get(name))
        .map(([key]) => key);
    expect(keysOf(0, 'left')).toEqual(['ArrowLeft', 'a', 'q']);
    expect(keysOf(0, 'a')).toEqual(['x', ' ']);
    expect(keysOf(0, 'pause')).toEqual(['Escape', 'Enter']);
    expect(keysOf(1, 'up')).toEqual(['i']);
    expect(keysOf(1, 'x')).toEqual([',', ';']);
    expect(table.pad.get('stick-left')).toBe(table.bits.get('left'));
    expect(table.pad.get('start')).toBe(table.bits.get('pause'));
  });

  it('two-players gives each action a key of its own for either player', () => {
    for (const draft of INPUT_PRESETS['two-players']) {
      const players = new Set(
        draft.inputs.flatMap((input) => (input.kind === 'key' ? [input.player] : [])),
      );
      expect([...players].sort()).toEqual([0, 1]);
    }
  });
});
