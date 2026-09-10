import type { SoundPort } from '../api/ports';
import type { Game } from '../game/Game';
import { type Instrument, type Pattern, type Song, SONG_SLOTS, VOICES } from './model';
import { decodeSample } from './sample-codec';
import type { AudioBackend } from './WebAudioBackend';
import type { SynthEvent } from './worklet/protocol';

/**
 * Facade over the audio backend used both by the runtime (`sound.*` Lua API)
 * and the editor (live instrument preview, pattern playback). Mirrors the game
 * document's sound library into the worklet whenever it changes.
 */
/** Long enough that one gesture's document events arrive as a single push, short enough to be the
 *  next bar rather than the next minute. */
const RESYNC_MS = 50;

export class SoundEngine implements SoundPort {
  private position: { pattern: number; step: number } | null = null;
  private readonly voices: boolean[] = Array.from({ length: VOICES }, () => false);
  private readonly unsub: (() => void)[] = [];
  private instruments = new Map<string, Instrument>();
  private patterns = new Map<string, Pattern>();
  private sfxSlots = new Map<string, string>();
  private songs = new Map<string, Song>();
  private librarySent = false;
  /** Whether the worklet has music to play, which is what makes a stale library worth resending. */
  private playing = false;
  private pendingSync: ReturnType<typeof setTimeout> | null = null;
  private scope: Float32Array = new Float32Array(0);
  private readonly samplesSent = new Set<string>();

  constructor(
    private readonly backend: AudioBackend,
    private readonly game: Game,
  ) {
    this.unsub.push(
      backend.onEvent((e) => {
        this.onEvent(e);
      }),
    );
    const resync = (): void => {
      this.librarySent = false;
      // Nothing asks for the library between the calls that begin a sound, so a pattern edited
      // while it loops would go on playing the copy taken when it started. Sent on a delay rather
      // than at once, because one gesture can land as a run of document events.
      if (!this.playing || this.pendingSync !== null) return;
      this.pendingSync = setTimeout(() => {
        this.pendingSync = null;
        this.syncLibrary();
      }, RESYNC_MS);
    };
    game.instruments.observe(resync);
    game.patterns.observe(resync);
    game.sfx.observe(resync);
    game.songs.observe(resync);
    const resample = (): void => {
      // An edited or replaced sample has to be re-sent under the same id.
      this.samplesSent.clear();
    };
    game.samples.observe(resample);
    this.unsub.push(() => {
      game.samples.unobserve(resample);
      game.instruments.unobserve(resync);
      game.patterns.unobserve(resync);
      game.sfx.unobserve(resync);
      game.songs.unobserve(resync);
    });
  }

  unlock(): Promise<void> {
    return this.backend.unlock();
  }

  /**
   * Samples are pushed separately from the library: they are orders of magnitude larger, and the
   * library resyncs on every instrument tweak. Each id is sent once per engine.
   */
  private syncSamples(): void {
    this.game.samples.forEach((encoded, id) => {
      if (this.samplesSent.has(id)) return;
      this.samplesSent.add(id);
      const data = decodeSample(encoded);
      if (data.length) this.backend.post({ type: 'sample', id, data });
    });
  }

  private syncLibrary(): void {
    this.syncSamples();
    if (this.librarySent) return;
    this.instruments = this.game.getInstruments();
    this.patterns = this.game.getPatterns();
    this.sfxSlots = this.game.getSfxSlots();
    this.songs = this.game.getSongs();
    this.backend.post({
      type: 'library',
      instruments: [...this.instruments],
      patterns: [...this.patterns],
    });
    this.librarySent = true;
  }

  /**
   * Editor preview: play an instrument that may not be saved yet.
   *
   * A `length` of zero holds the note at the instrument's sustain level until {@link stopNote},
   * which is what a keyboard key does — and that needs a `channel`, since the voice a note lands
   * on is otherwise chosen inside the worklet and never named back here.
   */
  preview(instrument: Instrument, pitch: number, length = 0.5, channel?: number): void {
    this.syncLibrary();
    const tmp = new Map(this.instruments);
    tmp.set(instrument.id, instrument);
    this.backend.post({ type: 'library', instruments: [...tmp], patterns: [...this.patterns] });
    this.librarySent = false;
    this.backend.post({
      type: 'note_on',
      instrument: instrument.id,
      pitch,
      velocity: 1,
      length,
      channel,
    });
  }

  previewPattern(pattern: Pattern, loop: boolean, from = 0): void {
    this.syncLibrary();
    const tmp = new Map(this.patterns);
    tmp.set(pattern.id, pattern);
    this.backend.post({ type: 'library', instruments: [...this.instruments], patterns: [...tmp] });
    this.librarySent = false;
    this.playing = true;
    this.backend.post({
      type: 'play_song',
      song: { name: pattern.name, sequence: [pattern.id], loop, loopStart: 0 },
      loop,
      fadeIn: 0,
      from,
    });
  }

  // ---- SoundPort ------------------------------------------------------------

  playSfx(slot: number, channel: number | undefined, pitchOffset: number, volume: number): void {
    this.syncLibrary();
    // Any number at all: an empty slot is silent, and there is no number past which they stop
    // being empty.
    const pattern = this.sfxSlots.get(String(slot));
    if (!pattern) return;
    this.backend.post({ type: 'play_sfx', pattern, pitchOffset, volume, channel });
  }

  playNote(
    instrument: string,
    pitch: number,
    length: number,
    volume: number,
    channel: number | undefined,
  ): void {
    this.syncLibrary();
    const id = this.instruments.has(instrument)
      ? instrument
      : [...this.instruments.values()].find((i) => i.name === instrument)?.id;
    if (!id) return;
    this.backend.post({
      type: 'note_on',
      instrument: id,
      pitch,
      velocity: volume,
      length,
      channel,
    });
  }

  stopNote(channel: number): void {
    this.backend.post({ type: 'note_off', channel });
  }

  playMusic(song: number, loop: boolean, fadeIn: number): void {
    this.syncLibrary();
    if (song < 0 || song >= SONG_SLOTS) return;
    const s = this.songs.get(String(song));
    if (!s) return;
    this.playing = true;
    this.backend.post({ type: 'play_song', song: s, loop, fadeIn });
  }

  /** Whether what is already playing loops; nothing happens when nothing is. */
  setLoop(loop: boolean): void {
    this.backend.post({ type: 'set_loop', loop });
  }

  stopMusic(fadeOut: number): void {
    this.playing = false;
    this.backend.post({ type: 'stop_music', fadeOut });
  }

  stopAll(): void {
    this.playing = false;
    this.backend.post({ type: 'stop_all' });
    this.position = null;
  }

  setVolume(master: number, music?: number, sfx?: number): void {
    this.backend.post({ type: 'mixer', master, music, sfx });
  }

  musicPosition(): { pattern: number; step: number } | null {
    return this.position;
  }

  isPlaying(channel: number): boolean {
    return this.voices[channel] ?? false;
  }

  flush(): void {
    /* commands are posted immediately; nothing buffered */
  }

  destroy(): void {
    if (this.pendingSync !== null) clearTimeout(this.pendingSync);
    for (const u of this.unsub) u();
    this.stopAll();
  }

  private onEvent(e: SynthEvent): void {
    if (e.type === 'position') this.position = { pattern: e.pattern, step: e.step };
    else if (e.type === 'stopped') {
      this.position = null;
      this.playing = false;
    } else if (e.type === 'scope') this.scope = e.peaks;
    else
      e.active.forEach((a, i) => {
        this.voices[i] = a;
      });
  }

  /** Peak envelope of the last second of output, oldest first. Empty until the worklet is up. */
  peaks(): Float32Array {
    return this.scope;
  }
}
