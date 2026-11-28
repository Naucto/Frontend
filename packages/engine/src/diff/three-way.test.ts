import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { EditableGame } from '../game/EditableGame';
import { FIRST_MAP_ID, FIRST_SHEET_ID } from '../game/keys';
import { encodeState, openState } from '../game/state';
import { defaultInstrument, defaultPattern } from '../sound/model';
import { mergeTexts, mergeThreeWay, SpritesRenumberedError } from './three-way';

type Edit = (game: EditableGame) => void;

const start = (edit: Edit = () => undefined): string => {
  const doc = new Y.Doc();
  const game = new EditableGame(doc);
  game.seedDefaults();
  game.addFile('shop', 'one\ntwo\nthree\nfour\nfive', 'shop');
  edit(game);
  return encodeState(doc);
};
const edited = (state: string, edit: Edit): string => {
  const open = openState(state);
  edit(open.game);
  const out = open.save();
  open.close();
  return out;
};
const textOf = (game: EditableGame, id: string): string =>
  game.files.find((file) => file.id === id)?.text.toString() ?? '';

/** Merges two edits of one base; answers the merged game, or the conflicts' keys. */
function merge(
  mine: Edit,
  theirs: Edit,
  resolutions: Record<string, 'draft' | 'latest'> = {},
  base = start(),
): { game: EditableGame | null; conflicts: string[] } {
  const merged = mergeThreeWay(
    { base, draft: edited(base, mine), latest: edited(base, theirs) },
    resolutions,
  );
  return {
    game: merged.state === null ? null : openState(merged.state).game,
    conflicts: merged.conflicts.map((conflict) => conflict.key),
  };
}

describe('two texts of one base', () => {
  it('keeps both where they touch different lines', () => {
    expect(mergeTexts('a\nb\nc\nd', 'a\nB\nc\nd', 'a\nb\nc\nd\ne')).toEqual({
      text: 'a\nB\nc\nd\ne',
      conflict: false,
    });
  });

  it('keeps one side of a line both changed, and all that does not clash', () => {
    const texts = ['a\nb\nc\nd\ne', 'a\nMINE\nc\nd\nE', 'A\nTHEIRS\nc\nd\ne'] as const;
    expect(mergeTexts(...texts)).toEqual({ text: 'a\nMINE\nc\nd\nE', conflict: true });
    expect(mergeTexts(...texts, 'latest').text).toBe('A\nTHEIRS\nc\nd\nE');
  });

  it('takes an edit both made once', () => {
    expect(mergeTexts('a\nb', 'a\nB', 'a\nB')).toEqual({ text: 'a\nB', conflict: false });
  });
});

describe('a draft carried onto a newer save', () => {
  it('merges what touches different parts', () => {
    const { game, conflicts } = merge(
      (draft) => {
        draft.setFileText('shop', 'ONE\ntwo\nthree\nfour\nfive');
        draft.sheets[0]?.setPixel(0, 0, 5);
        draft.maps[0]?.setTile(1, 1, 3);
        draft.setNetPermission('players.score', 1);
        draft.describeMap(FIRST_MAP_ID, 'cave', null);
        draft.addSheet('more', 64, 64, 'more');
        draft.sheets.at(-1)?.setPixel(2, 2, 7);
        draft.addMap('den', 8, 8, 'den');
        draft.maps.at(-1)?.setTile(3, 3, 1);
        draft.addAction({ name: 'dash' });
        draft.setPaletteColour(3, '#123456');
      },
      (latest) => {
        latest.setFileText('shop', 'one\ntwo\nthree\nfour\nFIVE');
        latest.sheets[0]?.setPixel(40, 40, 6);
        latest.maps[0]?.setTile(9, 9, 4);
        latest.setNetPermission('players', 3);
        latest.setInstrument(defaultInstrument('bell'));
        latest.addAction({ name: 'roll' });
      },
    );
    expect(conflicts).toEqual([]);
    if (!game) {
      throw new Error('not merged');
    }
    expect(textOf(game, 'shop')).toBe('ONE\ntwo\nthree\nfour\nFIVE');
    const sheet = game.sheets.find((held) => held.id === FIRST_SHEET_ID);
    expect([sheet?.getPixel(0, 0), sheet?.getPixel(40, 40)]).toEqual([5, 6]);
    expect([game.maps[0]?.getTile(1, 1), game.maps[0]?.getTile(9, 9)]).toEqual([3, 4]);
    expect(game.maps[0]?.name).toBe('cave');
    expect(game.sheets.find((held) => held.id === 'more')?.getPixel(2, 2)).toBe(7);
    expect(game.maps.find((held) => held.id === 'den')?.getTile(3, 3)).toBe(1);
    expect(game.netPermissions.get('players.score')).toEqual({ flags: 1 });
    expect(game.netPermissions.get('players')).toEqual({ flags: 3 });
    expect(game.getInstruments().has('bell')).toBe(true);
    expect(game.actions.map((action) => action.name)).toEqual(
      expect.arrayContaining(['dash', 'roll']),
    );
    expect(game.palette[3]).toBe('#123456');
  });

  it('asks about a part both changed, and merges nothing until told', () => {
    const mine: Edit = (game) => {
      game.setFileText('shop', 'one\nMINE\nthree\nfour\nfive');
      game.maps[0]?.setTile(1, 1, 3);
      game.maps[0]?.setTile(2, 1, 3);
      game.setNetPermission('a', 1);
    };
    const theirs: Edit = (game) => {
      game.setFileText('shop', 'one\nTHEIRS\nthree\nfour\nfive');
      game.maps[0]?.setTile(1, 1, 4);
      game.setNetPermission('a', 2);
    };
    const asked = merge(mine, theirs);
    expect(asked.game).toBeNull();
    expect(asked.conflicts.sort()).toEqual(['code:shop', `map:${FIRST_MAP_ID}`, 'net:a']);
    const told = merge(mine, theirs, {
      'code:shop': 'latest',
      [`map:${FIRST_MAP_ID}`]: 'latest',
      'net:a': 'draft',
    }).game;
    expect(textOf(told!, 'shop')).toBe('one\nTHEIRS\nthree\nfour\nfive');
    // The tile only the draft changed is kept beside the one that was refused.
    expect([told?.maps[0]?.getTile(1, 1), told?.maps[0]?.getTile(2, 1)]).toEqual([4, 3]);
    expect(told?.netPermissions.get('a')).toEqual({ flags: 1 });
  });

  it('asks about a file one side removed and the other changed', () => {
    const change: Edit = (game) => {
      game.setFileText('shop', 'changed');
    };
    const remove: Edit = (game) => {
      game.removeFile('shop');
    };
    expect(merge(change, remove).conflicts).toEqual(['code:shop']);
    expect(textOf(merge(change, remove, { 'code:shop': 'draft' }).game!, 'shop')).toBe('changed');
    const gone = merge(change, remove, { 'code:shop': 'latest' }).game;
    expect(gone?.files.some((file) => file.id === 'shop')).toBe(false);
    expect(merge(remove, change).conflicts).toEqual(['code:shop']);
    const removed = merge(remove, change, { 'code:shop': 'draft' }).game;
    expect(removed?.files.some((file) => file.id === 'shop')).toBe(false);
  });

  it('does not remove a net path with the one above it', () => {
    const base = start((game) => {
      game.setNetPermission('players', 1);
      game.setNetPermission('players.score', 3);
    });
    const { game } = merge(
      (draft) => {
        draft.dropNetRule('players');
      },
      (latest) => {
        latest.setNetPermission('players.score', 2);
      },
      {},
      base,
    );
    expect(game?.netPermissions.has('players')).toBe(false);
    expect(game?.netPermissions.get('players.score')).toEqual({ flags: 2 });
  });

  it('asks about an instrument removed on one side that the other came to play', () => {
    const base = start((game) => {
      game.setInstrument(defaultInstrument('bell'));
    });
    const play: Edit = (game) => {
      game.setPattern({
        ...defaultPattern('p'),
        notes: [{ step: 0, pitch: 60, length: 1, instrument: 'bell', volume: 1 }],
      });
    };
    const remove: Edit = (game) => {
      game.removeSound('instruments', 'bell');
    };
    const key = 'sound:instruments:bell';
    expect(merge(play, remove, {}, base).conflicts).toEqual([key]);
    expect(
      merge(play, remove, { [key]: 'draft' }, base)
        .game?.getInstruments()
        .has('bell'),
    ).toBe(true);
    expect(merge(remove, play, {}, base).conflicts).toEqual([key]);
    expect(
      merge(remove, play, { [key]: 'latest' }, base)
        .game?.getInstruments()
        .has('bell'),
    ).toBe(true);
  });

  it('asks about one name given to two controls', () => {
    const add: Edit = (game) => {
      game.addAction({ name: 'dash', inputs: [{ kind: 'key', player: 0, key: 'k' }] });
    };
    const base = start();
    const draft = edited(base, add);
    const latest = edited(base, add);
    const asked = mergeThreeWay({ base, draft, latest });
    expect(asked.conflicts.map((conflict) => conflict.reason)).toEqual(['name-taken']);
    const key = asked.conflicts[0]?.key ?? '';
    for (const side of ['draft', 'latest'] as const) {
      const merged = mergeThreeWay({ base, draft, latest }, { [key]: side });
      const names = openState(merged.state ?? '').game.actions.map((action) => action.name);
      expect(names.filter((name) => name === 'dash')).toHaveLength(1);
    }
  });

  it('refuses sides that number their sprites differently', () => {
    const base = start((game) => {
      game.addSheet('second', 64, 64, 'second');
    });
    expect(() =>
      merge(
        (draft) => {
          draft.maps[0]?.setTile(0, 0, 300);
        },
        (latest) => {
          latest.resizeSheet(FIRST_SHEET_ID, 256, 128);
        },
        {},
        base,
      ),
    ).toThrow(SpritesRenumberedError);
  });

  it('keeps the texts the game is described by as the latest save has them', () => {
    const { game } = merge(
      (draft) => {
        draft.setFileText('shop', 'x');
      },
      (latest) => {
        latest.doc.getText('projectName').insert(0, 'Cave');
      },
    );
    expect(game?.doc.getText('projectName').toString()).toBe('Cave');
    expect(textOf(game!, 'shop')).toBe('x');
  });
});
