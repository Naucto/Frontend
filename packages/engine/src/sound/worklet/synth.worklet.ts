/* eslint-disable */
// AudioWorkletProcessor wrapping SynthCore + Sequencer. Bundled to a string by
// scripts/build-worklet.mjs and loaded through a Blob URL by WebAudioBackend.
import type { Instrument, Pattern } from '../model';
import { Sequencer } from '../Sequencer';
import { SynthCore } from '../SynthCore';
import type { SynthCommand, SynthEvent } from './protocol';

/** Width of the scope trace in buckets — a little over a second at 128 frames a quantum. */
const SCOPE_BUCKETS = 200;

declare const sampleRate: number;
declare function registerProcessor(name: string, ctor: unknown): void;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor();
}

class NauctoSynthProcessor extends AudioWorkletProcessor {
  private readonly synth = new SynthCore(sampleRate);
  private readonly seq = new Sequencer(this.synth, sampleRate);
  private instruments = new Map<string, Instrument>();
  private patterns = new Map<string, Pattern>();
  private tick = 0;
  private lastPos: string | null = null;
  /** Rolling peak envelope for the editor's oscilloscope; one bucket per render quantum. */
  private readonly scope = new Float32Array(SCOPE_BUCKETS);
  private scopeAt = 0;

  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent<SynthCommand>) => {
      this.handle(e.data);
    };
  }

  private send(ev: SynthEvent): void {
    this.port.postMessage(ev);
  }

  private handle(cmd: SynthCommand): void {
    switch (cmd.type) {
      case 'library':
        this.instruments = new Map(cmd.instruments);
        this.patterns = new Map(cmd.patterns);
        this.seq.setLibrary(this.instruments, this.patterns);
        break;
      case 'sample':
        this.synth.samples.set(cmd.id, cmd.data);
        break;
      case 'note_on': {
        const ins = this.instruments.get(cmd.instrument);
        if (ins) this.synth.noteOn(ins, cmd.pitch, cmd.velocity, cmd.length, cmd.channel, 1);
        break;
      }
      case 'note_off':
        this.synth.noteOff(cmd.channel);
        break;
      case 'play_sfx': {
        const p = this.patterns.get(cmd.pattern);
        if (p) this.seq.playSfx(p, cmd.pitchOffset, cmd.volume, cmd.channel);
        break;
      }
      case 'play_song':
        this.seq.playSong(cmd.song, cmd.loop, cmd.fadeIn);
        break;
      case 'stop_music':
        this.seq.stopMusic(cmd.fadeOut);
        break;
      case 'stop_all':
        this.seq.stopAll();
        break;
      case 'mixer':
        this.synth.master = cmd.master;
        if (cmd.sfx !== undefined) this.synth.sfxGain = cmd.sfx;
        break;
    }
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const out = outputs[0];
    if (!out || out.length === 0) return true;
    const left = out[0] as Float32Array;
    const right = out[1] ?? left;
    const frames = left.length;
    this.seq.advance(frames);
    this.synth.render(left, right, frames);

    // One bucket per quantum: the loudest sample in it, signed, so the trace keeps its shape.
    let peak = 0;
    for (let i = 0; i < frames; i++) {
      const v = left[i] ?? 0;
      if (Math.abs(v) > Math.abs(peak)) peak = v;
    }
    this.scope[this.scopeAt] = peak;
    this.scopeAt = (this.scopeAt + 1) % SCOPE_BUCKETS;

    if (++this.tick % 8 === 0) {
      const pos = this.seq.position();
      const key = pos ? `${String(pos.pattern)}:${String(pos.step)}` : null;
      if (key !== this.lastPos) {
        this.lastPos = key;
        if (pos) this.send({ type: 'position', pattern: pos.pattern, step: pos.step });
        else this.send({ type: 'stopped' });
      }
      this.send({ type: 'voices', active: this.synth.voices.map((v) => v.active) });
      // Unrolled so the oldest bucket is first — the consumer draws left to right.
      const peaks = new Float32Array(SCOPE_BUCKETS);
      for (let i = 0; i < SCOPE_BUCKETS; i++) {
        peaks[i] = this.scope[(this.scopeAt + i) % SCOPE_BUCKETS] ?? 0;
      }
      this.send({ type: 'scope', peaks });
    }
    return true;
  }
}

registerProcessor('naucto-synth', NauctoSynthProcessor);
