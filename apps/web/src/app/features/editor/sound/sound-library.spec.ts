import {
  defaultPattern,
  defaultSfx,
  defaultSong,
  EditableGame,
  INSTRUMENT_PRESETS,
  LOCAL_ORIGIN,
  type Note,
  type Song,
  type SongBlock,
} from '@naucto/engine';
import { beforeEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { SoundLibrary } from './sound-library';

const block = (id: string, pattern: string, start: number): SongBlock => ({
  id,
  pattern,
  start,
  repeat: 1,
  track: 0,
});

const tune = (...blocks: SongBlock[]): Song => ({ ...defaultSong(120), blocks });

describe('SoundLibrary', () => {
  let game: EditableGame;
  let library: SoundLibrary;

  const starts = (slot: number): number[] =>
    (library.songs().get(String(slot))?.blocks ?? [])
      .map((each) => each.start)
      .sort((a, b) => a - b);

  beforeEach(() => {
    game = new EditableGame(new Y.Doc());
    library = new SoundLibrary(game);
  });

  it('names a new instrument from the pool, and a preset-born one after the preset', () => {
    expect(library.addInstrument().name).toBe('lead');
    const hat = INSTRUMENT_PRESETS.find((preset) => preset.name === 'Noise hat');
    if (!hat) {
      throw new Error('no such preset');
    }
    const born = library.addInstrument({ name: hat.name, settings: hat.settings });
    expect(born.name).toBe('Noise hat');
    expect(born.osc).toBe('noise');
    expect(born.filter.type).toBe('hp');
    // Told apart by a number the second time, since the list shows names and nothing else.
    expect(library.addInstrument({ name: hat.name, settings: hat.settings }).name).toBe(
      'Noise hat 2',
    );
    // Each has an id of its own; the settings carry none.
    expect(new Set([...library.instruments().keys()]).size).toBe(3);
  });

  /**
   * Two people adding at once is not a race the numbering can win — neither has seen the other's
   * write — so the repair happens afterwards, and has to give the same answer on both machines.
   */
  it('pulls two patterns that landed on the same number apart, the same way everywhere', () => {
    const mine = defaultPattern('p0', 0, 'pattern 00');
    library.putPattern(mine);
    // What a peer's write looks like once it arrives: a second pattern already carrying slot 0.
    game.setPattern({ ...mine, id: 'zzzz-peer' });
    expect([...library.patterns().values()].filter((pattern) => pattern.slot === 0)).toHaveLength(
      2,
    );

    library.reconcilePatternSlots();
    const slots = [...library.patterns().values()].map((pattern) => pattern.slot).sort();
    expect(slots).toEqual([0, 1]);
    // The id that sorts first keeps the number, which is what both machines agree on.
    expect(library.patterns().get('zzzz-peer')?.slot).toBe(1);
  });

  it('puts a sound effect at any number at all', () => {
    library.putSfx(200, defaultSfx('jump'));
    expect(library.sfx().get('200')?.name).toBe('jump');

    library.putSfx(-1, defaultSfx('nope'));
    expect(library.sfx().size).toBe(1);
    expect(library.nextSfxSlot()).toBe(201);

    library.removeSfx(200);
    expect(library.sfx().size).toBe(0);
  });

  it('puts a music at any number at all', () => {
    library.putSong(20, tune(block('a', 'p0', 0)));
    expect(library.songs().get('20')?.blocks).toHaveLength(1);

    library.putSong(-1, tune());
    expect(library.songs().size).toBe(1);
    expect(library.nextSongSlot()).toBe(0);
  });

  it('pushes the blocks after a pattern made longer with END, in every music, and not when made shorter', () => {
    library.putPattern({ ...defaultPattern('p0', 0), steps: 16 });
    library.putPattern({ ...defaultPattern('p1', 1), steps: 16 });
    library.putSong(0, tune(block('a', 'p0', 0), block('b', 'p1', 1)));
    library.putSong(1, tune(block('c', 'p1', 0), block('d', 'p0', 1), block('e', 'p1', 2)));

    library.setPatternLength('p0', 32);
    expect(starts(0)).toEqual([0, 2]);
    expect(starts(1)).toEqual([0, 1, 3]);

    library.setPatternLength('p0', 16);
    expect(starts(0)).toEqual([0, 2]);
  });

  it('grows and shrinks a pattern with its notes without moving any block, as FL Studio does', () => {
    const note = (step: number): Note => ({
      step,
      pitch: 60,
      length: 1,
      instrument: 'i',
      volume: 1,
    });
    library.putPattern({ ...defaultPattern('p0', 0), steps: 16, notes: [note(0)] });
    library.putPattern({ ...defaultPattern('p1', 1), steps: 16 });
    library.putSong(0, tune(block('a', 'p0', 0), block('b', 'p1', 1)));

    library.setPatternNotes('p0', [note(0), note(20)]);
    expect(library.patterns().get('p0')?.steps).toBe(32);
    expect(starts(0)).toEqual([0, 1]);

    library.setPatternNotes('p0', [note(0)]);
    expect(library.patterns().get('p0')?.steps).toBe(16);
    expect(starts(0)).toEqual([0, 1]);
  });

  it('takes a removed pattern out of every music, and says where it was used', () => {
    library.putPattern(defaultPattern('p0', 0));
    library.putPattern(defaultPattern('p1', 1));
    library.putSong(3, { ...tune(block('a', 'p0', 0), block('b', 'p1', 2)), name: 'boss' });
    expect(library.patternUsage('p0')).toEqual([{ slot: 3, name: 'boss', uses: 1 }]);

    library.removePattern('p0');
    expect(library.patterns().has('p0')).toBe(false);
    expect(
      library
        .songs()
        .get('3')
        ?.blocks.map((each) => each.id),
    ).toEqual(['b']);
  });

  it('takes a removed instrument out of the SFX too', () => {
    const inst = library.addInstrument();
    library.putSfx(0, {
      ...defaultSfx(),
      notes: [{ step: 0, pitch: 60, length: 1, instrument: inst.id, volume: 1 }],
    });
    expect(library.usedBy(inst.id).sfx).toEqual([0]);

    library.removeInstrument(inst.id);
    expect(library.sfx().get('0')?.notes).toEqual([]);
  });

  it('leaves a duplicate the sample bytes when the original clears its own', () => {
    const inst = library.addInstrument();
    library.setInstrumentSample(inst.id, 'AAAA');
    const copy = library.duplicateInstrument(inst.id);
    if (!copy?.sampleId) {
      throw new Error('the duplicate holds no sample');
    }

    library.setInstrumentSample(inst.id, null);
    expect(game.getInstruments().get(inst.id)?.sampleId).toBeUndefined();
    expect(game.samples.get(copy.sampleId)).toBe('AAAA');

    library.setInstrumentSample(copy.id, null);
    expect(game.samples.size).toBe(0);
  });

  it('keeps a duplicate its bytes when the original clears a shared sample and imports another', () => {
    const inst = library.addInstrument();
    library.setInstrumentSample(inst.id, 'AAAA');
    const copy = library.duplicateInstrument(inst.id);
    if (!copy?.sampleId) {
      throw new Error('the duplicate holds no sample');
    }

    library.setInstrumentSample(inst.id, null);
    library.setInstrumentSample(inst.id, 'BBBB');
    expect(game.samples.get(copy.sampleId)).toBe('AAAA');
    const mine = game.getInstruments().get(inst.id)?.sampleId ?? '';
    expect(game.samples.get(mine)).toBe('BBBB');
  });

  it('numbers a duplicate past the names already taken', () => {
    const inst = library.addInstrument();
    expect(library.duplicateInstrument(inst.id)?.name).toBe('lead 2');
    expect(library.duplicateInstrument(inst.id)?.name).toBe('lead 3');
  });

  it('drops the sample bytes with the last instrument that plays them', () => {
    const inst = library.addInstrument();
    library.setInstrumentSample(inst.id, 'AAAA');
    const copy = library.duplicateInstrument(inst.id);
    if (!copy?.sampleId) {
      throw new Error('the duplicate holds no sample');
    }

    library.removeInstrument(inst.id);
    expect(game.samples.get(copy.sampleId)).toBe('AAAA');

    library.removeInstrument(copy.id);
    expect(game.samples.size).toBe(0);
  });

  it('gives a duplicate bytes of its own when it replaces a shared sample', () => {
    const inst = library.addInstrument();
    library.setInstrumentSample(inst.id, 'AAAA');
    const copy = library.duplicateInstrument(inst.id);
    if (!copy) {
      throw new Error('no duplicate');
    }

    library.setInstrumentSample(copy.id, 'BBBB');
    const mine = game.getInstruments().get(inst.id)?.sampleId ?? '';
    const theirs = game.getInstruments().get(copy.id)?.sampleId ?? '';
    expect(mine).not.toBe(theirs);
    expect(game.samples.get(mine)).toBe('AAAA');
    expect(game.samples.get(theirs)).toBe('BBBB');
  });
});

describe('SoundLibrary under the SOUND tab history', () => {
  it('takes a music back as one step, and a sample too', () => {
    const game = new EditableGame(new Y.Doc());
    const library = new SoundLibrary(game);
    const undo = new Y.UndoManager(
      [game.instruments, game.patterns, game.sfx, game.songs, game.samples],
      { trackedOrigins: new Set([LOCAL_ORIGIN, null]), captureTimeout: 300 },
    );

    const pattern = defaultPattern('p0', 0, 'pattern 00');
    library.putPattern(pattern);
    undo.stopCapturing();
    library.putSong(0, tune(block('a', pattern.id, 0)));
    expect(game.getSongs().get('0')?.blocks).toHaveLength(1);
    undo.undo();
    expect(game.getSongs().size).toBe(0);
    undo.redo();
    expect(game.getSongs().get('0')?.blocks).toHaveLength(1);

    const inst = library.addInstrument();
    undo.stopCapturing();
    library.setInstrumentSample(inst.id, 'AAAA');
    const id = game.getInstruments().get(inst.id)?.sampleId ?? '';
    expect(game.samples.get(id)).toBe('AAAA');
    undo.undo();
    expect(game.samples.has(id)).toBe(false);
    expect(game.getInstruments().get(inst.id)?.sampleId).toBeUndefined();
  });
});
