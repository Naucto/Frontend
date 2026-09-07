import { noteNameToMidi } from '../sound/model';
import type { ApiContext } from './ApiContext';
import { EngineModule } from './EngineModule';

const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const opt = (v: unknown): number | undefined => (typeof v === 'number' ? Math.floor(v) : undefined);

/** The `sound` namespace. Silent no-ops when no audio backend is attached. */
export class SoundAPI extends EngineModule {
  constructor(ctx: ApiContext) {
    super(ctx);
    const s = (): ApiContext['sound'] => ctx.sound;
    ctx.lua.setGlobalWith('sound', {
      play_sfx: (slot: unknown, ch?: unknown, pitch?: unknown, vol?: unknown) => {
        s()?.playSfx(Math.floor(num(slot)), opt(ch), num(pitch), num(vol, 1));
      },
      play_note: (inst: unknown, pitch: unknown, len?: unknown, vol?: unknown, ch?: unknown) => {
        const midi = typeof pitch === 'string' ? (noteNameToMidi(pitch) ?? 60) : num(pitch, 60);
        s()?.playNote(String(inst), midi, num(len, 0.25), num(vol, 1), opt(ch));
      },
      stop_note: (ch: unknown) => {
        s()?.stopNote(Math.floor(num(ch)));
      },
      play_music: (song?: unknown, loop?: unknown, fade?: unknown) => {
        s()?.playMusic(Math.floor(num(song)), loop === undefined ? true : Boolean(loop), num(fade));
      },
      stop_music: (fade?: unknown) => {
        s()?.stopMusic(num(fade));
      },
      stop: () => {
        s()?.stopAll();
      },
      set_volume: (m: unknown, mu?: unknown, sf?: unknown) => {
        s()?.setVolume(
          num(m, 1),
          typeof mu === 'number' ? mu : undefined,
          typeof sf === 'number' ? sf : undefined,
        );
      },
      music_position: () => {
        const p = s()?.musicPosition();
        return p ? [p.pattern, p.step] : [undefined, undefined];
      },
      is_playing: (ch: unknown) => s()?.isPlaying(Math.floor(num(ch))) ?? false,
    });
  }
}
