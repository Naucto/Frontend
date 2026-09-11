import { Game } from '@naucto/engine';
import { beforeEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { SoundLibrary } from './sound-library';

describe('SoundLibrary', () => {
  let game: Game;
  let library: SoundLibrary;

  beforeEach(() => {
    game = new Game(new Y.Doc());
    library = new SoundLibrary(game);
  });

  it('gives a new pattern the lowest free number, and reuses one that was freed', () => {
    const a = library.addPattern();
    const b = library.addPattern();
    expect([a.slot, b.slot]).toEqual([0, 1]);

    library.removePattern(a.id);
    expect(library.addPattern().slot).toBe(0);
  });

  it('makes a pattern at the number asked for, holes and all', () => {
    library.addPattern();
    const far = library.addPattern(7);
    expect(far.slot).toBe(7);
    // The hole between them is not filled in on the way past: 1 is still the lowest free number.
    expect(library.addPattern().slot).toBe(1);
  });

  /**
   * Two people adding at once is not a race the numbering can win — neither has seen the other's
   * write — so the repair happens afterwards, and has to give the same answer on both machines.
   */
  it('pulls two patterns that landed on the same number apart, the same way everywhere', () => {
    const mine = library.addPattern();
    // What a peer's write looks like once it arrives: a second pattern already carrying slot 0.
    game.setPattern({ ...mine, id: 'zzzz-peer' });
    expect([...library.patterns().values()].filter((p) => p.slot === 0)).toHaveLength(2);

    library.reconcilePatternSlots();
    const slots = [...library.patterns().values()].map((p) => p.slot).sort();
    expect(slots).toEqual([0, 1]);
    // The id that sorts first keeps the number, which is what both machines agree on.
    expect(library.patterns().get('zzzz-peer')?.slot).toBe(1);
  });

  it('takes a pattern out of every sfx slot it was in when it is deleted', () => {
    const p = library.addPattern();
    library.assignSfx(3, p.id);
    library.assignSfx(9, p.id);
    expect([...library.sfx().keys()].sort()).toEqual(['3', '9']);

    library.removePattern(p.id);
    expect(library.sfx().size).toBe(0);
  });

  it('puts a sound effect at any number at all', () => {
    const p = library.addPattern();
    library.assignSfx(200, p.id);
    expect(library.sfx().get('200')).toBe(p.id);

    // Below zero is not a slot, so nothing is written and the bank is unchanged.
    library.assignSfx(-1, p.id);
    expect(library.sfx().size).toBe(1);
  });

  it('keeps the empty places of a music, which is what a hole is written as', () => {
    const a = library.addPattern();
    const b = library.addPattern();
    library.setSongSequence(0, [a.id, null, b.id]);
    expect(library.songs().get('0')?.sequence).toEqual([a.id, null, b.id]);
  });
});
