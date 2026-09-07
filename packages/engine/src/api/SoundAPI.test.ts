import { describe, expect, it } from 'vitest';

import { InputState } from '../input/InputState';
import { LuaEnvironment } from '../vm/LuaEnvironment';
import type { ApiContext } from './ApiContext';
import type { GameData, GfxBackend, SoundPort, SysPort } from './ports';
import { SoundAPI } from './SoundAPI';

const stub = {} as unknown;

/** A console holding one position, which is all `sound.music_position` reads. */
const setup = (step: number | null): LuaEnvironment => {
  const lua = new LuaEnvironment();
  const sound = {
    musicPosition: () => (step === null ? null : { pattern: 2, step }),
  } as unknown as SoundPort;
  const ctx: ApiContext = {
    lua,
    sound,
    gfx: stub as GfxBackend,
    data: stub as GameData,
    sys: stub as SysPort,
    input: new InputState(),
    log: () => undefined,
    print: () => undefined,
  };
  new SoundAPI(ctx);
  return lua;
};

describe('SoundAPI sound.music_position', () => {
  it('hands a game a whole step even though the clock runs between them', () => {
    // The sequencer's own position is fine enough to move a playhead, so it sits between two steps
    // for most of each one. A game compares this against the step a note is written on, and there
    // is no note at 2.125 — it belongs to the step that has not finished.
    const lua = setup(2.125);
    expect(lua.evaluate('local p, s = sound.music_position() return s')).toEqual([3]);
    expect(lua.evaluate('local p, s = sound.music_position() return p')).toEqual([2]);
  });

  it('lands exactly on a step boundary', () => {
    expect(setup(4).evaluate('local p, s = sound.music_position() return s')).toEqual([4]);
  });

  it('gives nothing while stopped', () => {
    expect(setup(null).evaluate('local p, s = sound.music_position() return s')).toEqual([
      undefined,
    ]);
  });
});
