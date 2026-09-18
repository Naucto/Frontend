import type { SynthCommand, SynthEvent } from './worklet/protocol';
import { SYNTH_WORKLET_SOURCE } from './worklet/synth.worklet.generated';

export interface AudioBackend {
  /** Must be called from a user gesture before sound can play. */
  unlock(): Promise<void>;
  post(cmd: SynthCommand): void;
  onEvent(l: (e: SynthEvent) => void): () => void;
  readonly ready: boolean;
  destroy(): void;
}

/**
 * AudioContext + AudioWorkletNode hosting the synth.
 *
 * A browser will not start an AudioContext without a user gesture, and a game's `_init` runs
 * before the gesture that started it has finished unlocking one. What that call asks for is kept
 * rather than dropped: the library it will play out of, the last thing it said to do with the
 * transport, whether it then held it, and the last one-shot it fired. Held notes are not kept,
 * because a note that was due before there was any sound is not due once there is.
 */
export class WebAudioBackend implements AudioBackend {
  private ctx: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private readonly queue: SynthCommand[] = [];
  private pendingTransport: SynthCommand | null = null;
  private pendingSfx: SynthCommand | null = null;
  private pendingPause = false;
  private readonly listeners = new Set<(e: SynthEvent) => void>();
  private unlocking: Promise<void> | null = null;

  constructor(private readonly workletUrl?: string) {}

  get ready(): boolean {
    return this.node !== null;
  }

  unlock(): Promise<void> {
    // Nothing here ever suspends the context on purpose, so a suspended one is the browser's doing
    // -- a hidden tab, a lost output device -- and a gesture is the one thing that gets it back.
    if (this.node) return this.ctx?.state === 'suspended' ? this.ctx.resume() : Promise.resolve();
    // Memoised so concurrent gestures share one context, but only while it may still succeed: a
    // refused resume or a worklet that would not load has to leave the next gesture a chance, and
    // a kept rejection answered every one of them for the life of the page.
    this.unlocking ??= this.init().catch((e: unknown) => {
      this.unlocking = null;
      throw e;
    });
    return this.unlocking;
  }

  post(cmd: SynthCommand): void {
    if (this.node) {
      this.node.port.postMessage(cmd);
      return;
    }
    if (cmd.type === 'library' || cmd.type === 'mixer' || cmd.type === 'sample')
      this.queue.push(cmd);
    // Only the last of these, because they contradict each other: a game that starts a song and
    // then stops it wants silence, not both in the order they were asked for.
    else if (cmd.type === 'play_song' || cmd.type === 'stop_music' || cmd.type === 'stop_all') {
      this.pendingTransport = cmd;
      // A stop resets the hold as well, the way it does in the worklet.
      if (cmd.type === 'stop_all') this.pendingPause = false;
    }
    // A game that opens on a jingle plays it from `_init`, which is always ahead of the unlock, so
    // dropping this one meant the opening sound of a game simply never existed. Only the last, for
    // the reason above: the loop keeps running while the context comes up, and a game firing one
    // every frame would otherwise play the lot at once.
    else if (cmd.type === 'play_sfx') this.pendingSfx = cmd;
    // Only the last word on the hold, replayed after the transport it holds.
    else if (cmd.type === 'pause') this.pendingPause = true;
    else if (cmd.type === 'resume') this.pendingPause = false;
  }

  onEvent(l: (e: SynthEvent) => void): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  destroy(): void {
    this.node?.disconnect();
    this.node = null;
    void this.ctx?.close();
    this.ctx = null;
    this.listeners.clear();
    this.queue.length = 0;
    this.pendingTransport = null;
    this.pendingSfx = null;
    this.pendingPause = false;
    this.unlocking = null;
  }

  private async init(): Promise<void> {
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    this.ctx = ctx;
    if (ctx.state === 'suspended') await ctx.resume();
    const url =
      this.workletUrl ??
      URL.createObjectURL(new Blob([SYNTH_WORKLET_SOURCE], { type: 'text/javascript' }));
    await ctx.audioWorklet.addModule(url);
    const node = new AudioWorkletNode(ctx, 'naucto-synth', { outputChannelCount: [2] });
    node.port.onmessage = (e: MessageEvent<SynthEvent>) => {
      this.listeners.forEach((l) => {
        l(e.data);
      });
    };
    node.connect(ctx.destination);
    this.node = node;
    for (const cmd of this.queue) node.port.postMessage(cmd);
    this.queue.length = 0;
    // After the library, never before it: a song names the instruments and patterns it plays out of.
    if (this.pendingTransport) {
      node.port.postMessage(this.pendingTransport);
      this.pendingTransport = null;
    }
    if (this.pendingSfx) {
      node.port.postMessage(this.pendingSfx);
      this.pendingSfx = null;
    }
    if (this.pendingPause) {
      node.port.postMessage({ type: 'pause' });
      this.pendingPause = false;
    }
  }
}
