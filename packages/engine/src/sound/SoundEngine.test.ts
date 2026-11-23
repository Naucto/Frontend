import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { EditableGame } from '../game/EditableGame';
import {
  defaultInstrument,
  defaultPattern,
  defaultSfx,
  defaultSong,
  type Instrument,
  type Pattern,
  type Sfx,
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
  library(): {
    instruments: Map<string, Instrument>;
    patterns: Map<string, Pattern>;
    sfx: Map<string, Sfx>;
  } {
    const last = this.posted.filter((command) => command.type === 'library').at(-1);
    if (last?.type !== 'library') {
      throw new Error('no library was sent');
    }
    return {
      instruments: new Map(last.instruments),
      patterns: new Map(last.patterns),
      sfx: new Map(last.sfx),
    };
  }
}

/** One instrument called lead, one pattern numbered 3 at 124 bpm, one song in slot 0 that loops. */
function setup(): { engine: SoundEngine; backend: FakeBackend; game: EditableGame } {
  const game = new EditableGame(new Y.Doc());
  game.setInstrument(defaultInstrument('i1', 'lead'));
  game.setPattern(defaultPattern('p1', 3));
  game.setSong(0, { ...defaultSong(), blocks: [{ id: 'b0', pattern: 'p1', start: 0, repeat: 1 }] });
  const backend = new FakeBackend();
  return { engine: new SoundEngine(backend, game), backend, game };
}

describe('SoundEngine overrides', () => {
  it('changes what the worklet plays without touching the document', () => {
    const { engine, backend, game } = setup();
    expect(engine.setInstrumentOverride('lead', { duty: 0.2, env: { attack: 1 } })).toBe(true);
    expect(engine.setPatternOverride(3, { steps: 48 })).toBe(true);
    const lib = backend.library();
    expect(lib.instruments.get('i1')).toMatchObject({ duty: 0.2, env: { attack: 1, decay: 0.1 } });
    expect(lib.patterns.get('p1')?.steps).toBe(48);
    expect(game.getInstruments().get('i1')?.duty).toBe(0.5);
    expect(game.getPatterns().get('p1')?.steps).toBe(16);
  });

  it('accumulates and only resends when something changes', () => {
    const { engine, backend } = setup();
    engine.setInstrumentOverride('lead', { env: { attack: 1 } });
    engine.setInstrumentOverride('lead', { env: { decay: 2 } });
    const sent = backend.posted.filter((command) => command.type === 'library').length;
    engine.setInstrumentOverride('lead', { env: { decay: 2 } });
    expect(backend.posted.filter((command) => command.type === 'library')).toHaveLength(sent);
    expect(backend.library().instruments.get('i1')?.env).toMatchObject({ attack: 1, decay: 2 });
  });

  it('survives an edit to the document', () => {
    const { engine, backend, game } = setup();
    engine.setPatternOverride(3, { steps: 8 });
    game.setPattern({ ...defaultPattern('p1', 3), bpm: 200 });
    game.setSfx(0, defaultSfx());
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
    expect(engine.setPatternOverride(4, { steps: 16 })).toBe(false);
    expect(engine.setSongOverride(1, { loop: false })).toBe(false);
    expect(backend.posted.filter((command) => command.type === 'library')).toHaveLength(0);
  });

  it('plays a music at any number, and nothing where there is none', () => {
    const { engine, backend, game } = setup();
    game.setSong(20, {
      ...defaultSong(),
      blocks: [{ id: 'b0', pattern: 'p1', start: 0, repeat: 1 }],
    });
    engine.playMusic(20, undefined, 0);
    expect(backend.posted.at(-1)).toMatchObject({ type: 'play_song' });
    const sent = backend.posted.length;
    engine.playMusic(21, undefined, 0);
    engine.playMusic(-1, undefined, 0);
    expect(backend.posted.slice(sent).some((command) => command.type === 'play_song')).toBe(false);
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

  it('changes the tempo of the music playing', () => {
    const { engine, backend } = setup();
    engine.playMusic(0, undefined, 0);
    engine.setSongOverride(0, { bpm: 90 });
    expect(backend.posted.at(-1)).toEqual({ type: 'set_bpm', bpm: 90 });
    engine.playMusic(0, undefined, 0);
    expect(backend.posted.at(-1)).toMatchObject({ type: 'play_song', song: { bpm: 90 } });
  });
});

describe('SoundEngine SFX', () => {
  it('plays a SFX by its slot, and nothing where there is none', () => {
    const { engine, backend, game } = setup();
    game.setSfx(7, { ...defaultSfx('jump') });
    engine.playSfx(7, undefined, 0, 1);
    expect(backend.posted.at(-1)).toEqual({
      type: 'play_sfx',
      slot: '7',
      pitchOffset: 0,
      volume: 1,
      channel: undefined,
    });
    expect(backend.library().sfx.get('7')?.name).toBe('jump');
    const sent = backend.posted.length;
    engine.playSfx(8, undefined, 0, 1);
    expect(backend.posted.slice(sent).some((command) => command.type === 'play_sfx')).toBe(false);
  });

  it('previews a pattern alone at its own tempo, from a step', () => {
    const { engine, backend } = setup();
    engine.previewPattern({ ...defaultPattern('p9'), bpm: 90, stepsPerBeat: 4 }, true, 8);
    expect(backend.posted.at(-1)).toMatchObject({
      type: 'play_song',
      song: { bpm: 90, loop: true },
      from: 2,
    });
  });

  it('keeps the pattern it previews through a note played and an edit to the document', () => {
    const { engine, backend, game } = setup();
    engine.previewPattern({ ...defaultPattern('p9'), bpm: 90 }, true);
    engine.preview(defaultInstrument('click'), 72, 0.03);
    game.setPattern({ ...defaultPattern('p1', 3), bpm: 200 });
    engine.playMusic(0, undefined, 0);
    expect(backend.library().patterns.get('__preview')?.bpm).toBe(90);
    engine.updatePreview({ ...defaultPattern('p9'), bpm: 90, steps: 48 });
    expect(backend.library().patterns.get('__preview')?.steps).toBe(48);
  });
});
