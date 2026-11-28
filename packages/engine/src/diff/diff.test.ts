import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { blankGame } from '../game/blank-game';
import { EditableGame } from '../game/EditableGame';
import { FIRST_MAP_ID, FIRST_SHEET_ID } from '../game/keys';
import type { Instrument, Pattern } from '../sound/model';
import { type ChangeItem, computeChanges, connectedAreas } from './changes';
import { decide } from './decisions';
import { lineDiff, lineHunks, mergeLines, wordDiff } from './lines';
import { displayState, mergeAccepted } from './merge';

/** A copy of `game` as a second, unrelated document, the way a proposal or a version arrives. */
function fork(doc: Y.Doc): { doc: Y.Doc; game: EditableGame } {
  const copy = new Y.Doc();
  Y.applyUpdate(copy, Y.encodeStateAsUpdate(doc));
  return { doc: copy, game: new EditableGame(copy) };
}

function base(): { doc: Y.Doc; game: EditableGame } {
  const doc = new Y.Doc();
  const game = blankGame(doc);
  game.addFile('main', 'local x = 1\nprint(x)\nreturn x', 'main');
  return { doc, game };
}

const keys = (items: ChangeItem[]): string[] => items.map((item) => item.key);

describe('line diff', () => {
  it('pairs a replaced line and cuts hunks at kept lines', () => {
    const rows = lineDiff('a\nb\nc\nd', 'a\nB\nc\nd\ne');
    expect(rows.map((row) => row.kind)).toEqual(['same', 'changed', 'same', 'same', 'added']);
    expect(lineHunks(rows)).toEqual([
      { start: 1, end: 2 },
      { start: 4, end: 5 },
    ]);
  });

  it('merges only the hunks taken', () => {
    const rows = lineDiff('a\nb\nc', 'a\nB\nc\nd');
    const hunks = lineHunks(rows);
    expect(mergeLines(rows, hunks, new Set([1]))).toBe('a\nb\nc\nd');
    expect(mergeLines(rows, hunks, new Set([0]))).toBe('a\nB\nc');
    expect(mergeLines(rows, hunks, new Set())).toBe('a\nb\nc');
  });

  it('marks the words that changed in a line', () => {
    expect(wordDiff('x = 1', 'x = 2')).toEqual([
      { text: 'x = ', kind: 'same' },
      { text: '1', kind: 'removed' },
      { text: '2', kind: 'added' },
    ]);
  });
});

describe('changes between two snapshots', () => {
  it('finds code hunks, a new file and a removed one', () => {
    const current = base();
    current.game.addFile('old', 'gone', 'old');
    const proposed = fork(current.doc);
    const main = proposed.game.files.find((file) => file.id === 'main');
    proposed.game.transact(() => {
      main?.text.delete(0, main.text.length);
      main?.text.insert(0, 'local x = 2\nprint(x)\nreturn x\n-- end');
    });
    proposed.game.removeFile('old');
    proposed.game.addFile('player', 'p = {}', 'player');
    const items = computeChanges(current.game, proposed.game);
    expect(keys(items)).toEqual(['code:main#h0', 'code:main#h1', 'code:player', 'code:old']);
    expect(items.map((item) => item.kind)).toEqual(['EDIT', 'NEW', 'NEW', 'DELETED']);
  });

  it('groups changed tiles into areas, eight neighbours apart', () => {
    const changed = new Uint8Array(5 * 3);
    // Two cells on a diagonal and one far away.
    changed[0] = 1;
    changed[6] = 1;
    changed[4] = 1;
    expect(connectedAreas(changed, 5, 3)).toEqual([[0, 6], [4]]);
  });

  it('ties the cells of a grown map to its size', () => {
    const current = base();
    const proposed = fork(current.doc);
    const map = proposed.game.maps.find((held) => held.id === FIRST_MAP_ID);
    const { width, height } = map ?? { width: 0, height: 0 };
    proposed.game.resizeMap(FIRST_MAP_ID, width + 4, height);
    const grown = proposed.game.maps.find((held) => held.id === FIRST_MAP_ID);
    grown?.setTile(width + 1, 0, 3);
    grown?.setTile(0, 0, 5);
    const items = computeChanges(current.game, proposed.game);
    const size = items.find((item) => item.type === 'map-size');
    const inside = items.find((item) => item.type === 'map-area' && item.bounds.x === 0)!;
    const outside = items.find((item) => item.type === 'map-area' && item.bounds.x > 0)!;
    expect(size?.deps?.onReject).toEqual([outside.key]);
    expect(outside.deps?.onAccept).toEqual([size?.key]);
    expect(inside.deps).toBeUndefined();
  });

  it('finds an edited sprite, its flag and a palette colour', () => {
    const current = base();
    const proposed = fork(current.doc);
    const sheet = proposed.game.sheets.find((held) => held.id === FIRST_SHEET_ID);
    sheet?.setPixel(9, 1, 4);
    sheet?.setFlag(sheet.base + 1, 0b101);
    proposed.game.setPaletteColour(2, '#123456');
    const items = computeChanges(current.game, proposed.game);
    expect(keys(items)).toEqual([
      `art:${FIRST_SHEET_ID}#c1,0`,
      `art:${FIRST_SHEET_ID}#c1,0#f`,
      'palette#2',
    ]);
    expect(items[0]?.kind).toBe('NEW');
  });
});

describe('decisions', () => {
  it('pulls a new instrument in with the pattern that plays it, and out with it', () => {
    const current = base();
    const proposed = fork(current.doc);
    const bell: Instrument = {
      ...([...current.game.getInstruments().values()][0] ?? ({} as Instrument)),
      id: 'bell',
      name: 'bell',
    };
    proposed.game.setInstrument(bell);
    const pattern: Pattern = {
      id: 'p14',
      slot: 14,
      name: 'chorus',
      bpm: 120,
      stepsPerBeat: 4,
      steps: 16,
      notes: [{ step: 0, pitch: 60, length: 1, instrument: 'bell', volume: 1 }],
    };
    proposed.game.setPattern(pattern);
    const items = computeChanges(current.game, proposed.game);
    const accepted = decide(items, new Map(), ['sound:patterns:p14'], 'ok');
    expect(accepted.get('sound:instruments:bell')).toBe('ok');
    const rejected = decide(items, accepted, ['sound:instruments:bell'], 'no');
    expect(rejected.get('sound:patterns:p14')).toBe('no');
    expect(
      decide(items, rejected, ['sound:patterns:p14'], 'pending').has('sound:patterns:p14'),
    ).toBe(false);
  });
});

describe('merge', () => {
  it('takes the accepted changes and leaves the rest as they were', () => {
    const current = base();
    const proposed = fork(current.doc);
    const main = proposed.game.files.find((file) => file.id === 'main');
    proposed.game.transact(() => {
      main?.text.delete(0, main.text.length);
      main?.text.insert(0, 'local x = 2\nprint(x)\nreturn x\n-- end');
    });
    proposed.game.addFile('player', 'p = {}', 'player');
    proposed.game.maps.find((held) => held.id === FIRST_MAP_ID)?.setTile(2, 2, 7);
    const items = computeChanges(current.game, proposed.game);
    const state = mergeAccepted(
      current.doc,
      proposed.game,
      items,
      new Set(['code:main#h1', 'code:player', `map:${FIRST_MAP_ID}#a0`]),
    );
    const merged = new EditableGame(new Y.Doc());
    merged.restoreFrom(state);
    expect(merged.files.find((file) => file.id === 'main')?.text.toString()).toBe(
      'local x = 1\nprint(x)\nreturn x\n-- end',
    );
    expect(merged.files.find((file) => file.id === 'player')?.text.toString()).toBe('p = {}');
    expect(merged.maps.find((held) => held.id === FIRST_MAP_ID)?.getTile(2, 2)).toBe(7);
    // The current document is read, never written.
    expect(current.game.files.find((file) => file.id === 'player')).toBeUndefined();
  });
});

describe('display', () => {
  it('draws what is waiting as kept, except a removal, and leaves out what was refused', () => {
    const current = base();
    current.game.maps.find((held) => held.id === FIRST_MAP_ID)?.setTile(9, 9, 4);
    const proposed = fork(current.doc);
    const map = proposed.game.maps.find((held) => held.id === FIRST_MAP_ID);
    map?.setTile(2, 2, 7);
    map?.setTile(9, 9, 0);
    proposed.game.addFile('player', 'p = {}', 'player');
    const items = computeChanges(current.game, proposed.game);
    const shown = new EditableGame(new Y.Doc());
    shown.restoreFrom(
      displayState(current.doc, proposed.game, items, new Map([['code:player', 'no' as const]])),
    );
    const tiles = shown.maps.find((held) => held.id === FIRST_MAP_ID);
    expect(tiles?.getTile(2, 2)).toBe(7);
    expect(tiles?.getTile(9, 9)).toBe(4);
    expect(shown.files.find((file) => file.id === 'player')).toBeUndefined();
  });
});
