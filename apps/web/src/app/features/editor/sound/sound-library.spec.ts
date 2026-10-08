import { defaultPattern, EditableGame, INSTRUMENT_PRESETS, LOCAL_ORIGIN } from '@naucto/engine';
import { beforeEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { SoundLibrary } from './sound-library';

describe('SoundLibrary', () => {
  let game: EditableGame;
  let library: SoundLibrary;

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
    const pattern = defaultPattern('p0', 0, 'pattern 00');
    library.putPattern(pattern);
    library.assignSfx(200, pattern.id);
    expect(library.sfx().get('200')).toBe(pattern.id);

    // Below zero is not a slot, so nothing is written and the bank is unchanged.
    library.assignSfx(-1, pattern.id);
    expect(library.sfx().size).toBe(1);
  });

  it('chains any pattern number into any music number at all', () => {
    const pattern = defaultPattern('p120', 120, 'pattern 120');
    library.putPattern(pattern);
    library.setSongSequence(20, [pattern.id]);
    expect(library.songs().get('20')?.sequence).toEqual([pattern.id]);

    library.setSongSequence(-1, [pattern.id]);
    expect(library.songs().size).toBe(1);
  });

  it('keeps the empty places of a music, which is what a hole is written as', () => {
    const first = defaultPattern('p0', 0, 'pattern 00');
    const second = defaultPattern('p1', 1, 'pattern 01');
    library.putPattern(first);
    library.putPattern(second);
    library.setSongSequence(0, [first.id, null, second.id]);
    expect(library.songs().get('0')?.sequence).toEqual([first.id, null, second.id]);
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
  it('takes a chained pattern and its place in the music back as one step, and a sample too', () => {
    const game = new EditableGame(new Y.Doc());
    const library = new SoundLibrary(game);
    const undo = new Y.UndoManager(
      [game.instruments, game.patterns, game.sfx, game.songs, game.samples],
      { trackedOrigins: new Set([LOCAL_ORIGIN, null]), captureTimeout: 300 },
    );

    const pattern = defaultPattern('p0', 0, 'pattern 00');
    library.putPattern(pattern);
    undo.stopCapturing();
    library.setSongSequence(0, [pattern.id]);
    expect(game.getSongs().get('0')?.sequence).toEqual([pattern.id]);
    undo.undo();
    expect(game.getSongs().size).toBe(0);
    undo.redo();
    expect(game.getSongs().get('0')?.sequence).toEqual([pattern.id]);

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
