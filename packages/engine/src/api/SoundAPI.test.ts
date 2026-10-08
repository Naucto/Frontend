import { describe, expect, it } from 'vitest';

import { LuaEnvironment } from '../vm/LuaEnvironment';
import type { SoundPort } from './ports';
import { SoundAPI } from './SoundAPI';
import { makeApiContext } from './test-context';

const setup = (step: number | null): LuaEnvironment => {
  const lua = new LuaEnvironment();
  const sound = {
    musicPosition: () => (step === null ? null : { pattern: 2, step }),
  } as unknown as SoundPort;
  new SoundAPI(makeApiContext(lua, { sound }));
  return lua;
};

describe('SoundAPI sound.music_pos', () => {
  it('hands a game the step that is sounding, however far into it the clock has run', () => {
    // The sequencer's own position is fine enough to move a playhead, so it carries a fraction for
    // most of each step. A game compares this against the step a note is written on, and 2.125 is
    // step 2 an eighth of the way through — that note is the one playing.
    const lua = setup(2.125);
    expect(lua.evaluate('local p, s = sound.music_pos() return s')).toEqual([2]);
    expect(lua.evaluate('local p, s = sound.music_pos() return p')).toEqual([2]);
  });

  it('starts at step 0', () => {
    expect(setup(0).evaluate('local p, s = sound.music_pos() return s')).toEqual([0]);
  });

  it('lands exactly on a step boundary', () => {
    expect(setup(4).evaluate('local p, s = sound.music_pos() return s')).toEqual([4]);
  });

  it('gives nothing while stopped', () => {
    expect(setup(null).evaluate('local p, s = sound.music_pos() return s')).toEqual([undefined]);
  });
});

const mount = (sound: Partial<SoundPort>): { lua: LuaEnvironment; warnings: string[] } => {
  const lua = new LuaEnvironment();
  const warnings: string[] = [];
  new SoundAPI(
    makeApiContext(lua, {
      sound: sound as SoundPort,
      log: (level, text) => {
        if (level === 'warn') {
          warnings.push(text);
        }
      },
    }),
  );
  return { lua, warnings };
};

describe('SoundAPI Lua truth', () => {
  it('takes 0 as a loop flag, as Lua does', () => {
    const loops: (boolean | undefined)[] = [];
    const { lua } = mount({ playMusic: (_song, loop) => loops.push(loop) });
    lua.evaluate('sound.play_music(0, 0) sound.play_music(0) sound.play_music(0, false)');
    expect(loops).toEqual([true, undefined, false]);
  });

  it('takes 0 as a loop override, as Lua does', () => {
    const loops: (boolean | undefined)[] = [];
    const { lua } = mount({ setSongOverride: (_slot, patch) => loops.push(patch.loop) > 0 });
    lua.evaluate('sound.set_music(0, {loop = 0}) sound.set_music(0, {loop = false})');
    expect(loops).toEqual([true, false]);
  });
});

describe('SoundAPI sound.play_note', () => {
  it('says once which instrument it could not find', () => {
    const { lua, warnings } = mount({ playNote: (instrument) => instrument === 'lead' });
    lua.evaluate(
      'sound.play_note("nope", 60) sound.play_note("nope", 62) sound.play_note("lead", 60)',
    );
    expect(warnings).toEqual(['sound.play_note: there is no instrument called "nope"']);
  });
});
