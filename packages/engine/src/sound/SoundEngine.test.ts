import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { Game } from '../game/Game';
import {
  defaultInstrument,
  defaultPattern,
  defaultSong,
  type Instrument,
  type Pattern,
} from './model';
import { SoundEngine } from './SoundEngine';
import type { AudioBackend } from './WebAudioBackend';
import type { SynthCommand } from './worklet/protocol';

/** Keeps every command, which is all the engine's side of the worklet can be seen by. */
class FakeBackend implements AudioBackend {
  readonly posted: SynthCommand[] = [];
  readonly ready = true;
  unlock(): Promise<void> {
    return Promise.resolve();
  }
  post(cmd: SynthCommand): void {
    this.posted.push(cmd);
  }
  onEvent(): () => void {
    return () => undefined;
  }
  destroy(): void {
    /* nothing to release */
  }
  /** The library the worklet holds now: the last one sent. */
  library(): { instruments: Map<string, Instrument>; patterns: Map<string, Pattern> } {
    const last = this.posted.filter((c) => c.type === 'library').at(-1);
    if (last?.type !== 'library') throw new Error('no library was sent');
    return { instruments: new Map(last.instruments), patterns: new Map(last.patterns) };
  }
}

/** One instrument called lead, one pattern numbered 3 at 124 bpm, one song in slot 0 that loops. */
function setup(): { engine: SoundEngine; backend: FakeBackend; game: Game } {
  const game = new Game(new Y.Doc());
  game.setInstrument(defaultInstrument('i1', 'lead'));
  game.setPattern(defaultPattern('p1', 3));
  game.setSong(0, { ...defaultSong(), sequence: ['p1'] });
  const backend = new FakeBackend();
  return { engine: new SoundEngine(backend, game), backend, game };
}

describe('SoundEngine overrides', () => {
  it('changes what the worklet plays without touching the document', () => {
    const { engine, backend, game } = setup();
    expect(engine.setInstrumentOverride('lead', { duty: 0.2, env: { attack: 1 } })).toBe(true);
    expect(engine.setPatternOverride(3, { bpm: 90 })).toBe(true);
    const lib = backend.library();
    expect(lib.instruments.get('i1')).toMatchObject({ duty: 0.2, env: { attack: 1, decay: 0.1 } });
    expect(lib.patterns.get('p1')?.bpm).toBe(90);
    expect(game.getInstruments().get('i1')?.duty).toBe(0.5);
    expect(game.getPatterns().get('p1')?.bpm).toBe(124);
  });

  it('accumulates and only resends when something changes', () => {
    const { engine, backend } = setup();
    engine.setInstrumentOverride('lead', { env: { attack: 1 } });
    engine.setInstrumentOverride('lead', { env: { decay: 2 } });
    const sent = backend.posted.filter((c) => c.type === 'library').length;
    engine.setInstrumentOverride('lead', { env: { decay: 2 } });
    expect(backend.posted.filter((c) => c.type === 'library')).toHaveLength(sent);
    expect(backend.library().instruments.get('i1')?.env).toMatchObject({ attack: 1, decay: 2 });
  });

  it('survives an edit to the document', () => {
    const { engine, backend, game } = setup();
    engine.setPatternOverride(3, { steps: 8 });
    game.setPattern({ ...defaultPattern('p1', 3), bpm: 200 });
    engine.playSfx(0, undefined, 0, 1);
    engine.playMusic(0, undefined, 0);
    expect(backend.library().patterns.get('p1')).toMatchObject({ bpm: 200, steps: 8 });
  });

  it('is gone once cleared', () => {
    const { engine, backend } = setup();
    engine.setInstrumentOverride('lead', { volume: 0.1 });
    engine.clearOverrides();
    engine.playMusic(0, undefined, 0);
    expect(backend.library().instruments.get('i1')?.volume).toBe(0.8);
  });

  it('says when there is nothing by that name or number', () => {
    const { engine, backend } = setup();
    expect(engine.setInstrumentOverride('bass', { volume: 0.1 })).toBe(false);
    expect(engine.setPatternOverride(4, { bpm: 90 })).toBe(false);
    expect(engine.setSongOverride(1, { loop: false })).toBe(false);
    expect(backend.posted.filter((c) => c.type === 'library')).toHaveLength(0);
  });

  it('reaches the music playing, and what play_music does when not told', () => {
    const { engine, backend } = setup();
    engine.playMusic(0, undefined, 0);
    engine.setSongOverride(0, { loop: false });
    expect(backend.posted.at(-1)).toEqual({ type: 'set_loop', loop: false });
    engine.stopMusic(0);
    engine.playMusic(0, undefined, 0);
    expect(backend.posted.at(-1)).toMatchObject({ type: 'play_song', loop: false });
    engine.playMusic(0, true, 0);
    expect(backend.posted.at(-1)).toMatchObject({ type: 'play_song', loop: true });
    engine.setSongOverride(0, { loop: true });
    expect(backend.posted.at(-1)).toEqual({ type: 'set_loop', loop: true });
  });
});
