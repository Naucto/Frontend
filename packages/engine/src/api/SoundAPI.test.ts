import { describe, expect, it } from 'vitest';

import { LuaEnvironment } from '../vm/LuaEnvironment';
import type { SoundPort } from './ports';
import { SoundAPI } from './SoundAPI';
import { makeApiContext } from './test-context';

const setup = (beat: number | null): LuaEnvironment => {
  const lua = new LuaEnvironment();
  const sound = {
    musicPosition: () => (beat === null ? null : { bar: 2, beat }),
  } as unknown as SoundPort;
  new SoundAPI(makeApiContext(lua, { sound }));
  return lua;
};

describe('SoundAPI sound.music_pos', () => {
  it('hands a game the bar and the beat that is sounding, however far into it the clock has run', () => {
    const lua = setup(2.125);
    expect(lua.evaluate('local bar, beat = sound.music_pos() return beat')).toEqual([2]);
    expect(lua.evaluate('local bar, beat = sound.music_pos() return bar')).toEqual([2]);
  });

  it('starts at beat 0', () => {
    expect(setup(0).evaluate('local bar, beat = sound.music_pos() return beat')).toEqual([0]);
  });

  it('lands exactly on a beat', () => {
    expect(setup(3).evaluate('local bar, beat = sound.music_pos() return beat')).toEqual([3]);
  });

  it('gives nothing while stopped', () => {
    expect(setup(null).evaluate('local bar, beat = sound.music_pos() return beat')).toEqual([
      undefined,
    ]);
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

  it('sets the tempo on the music, and says set_pattern no longer does', () => {
    const patches: unknown[] = [];
    const { lua, warnings } = mount({
      setSongOverride: (_slot, patch) => patches.push(patch) > 0,
      setPatternOverride: (_slot, patch) => patches.push(patch) > 0,
    });
    lua.evaluate('sound.set_music(0, {bpm = 999}) sound.set_pattern(1, {bpm = 90})');
    expect(patches).toEqual([{ bpm: 240 }, {}]);
    expect(warnings).toEqual([
      'sound.set_pattern: bpm is now set on the music, with sound.set_music',
    ]);
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
