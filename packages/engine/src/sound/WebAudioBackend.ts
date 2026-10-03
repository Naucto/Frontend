import type { SynthCommand, SynthEvent } from './worklet/protocol';
import { SYNTH_WORKLET_SOURCE } from './worklet/synth.worklet.generated';

export interface AudioBackend {
  /** Must be called from a user gesture before sound can play. */
  unlock(): Promise<void>;
  post(cmd: SynthCommand): void;
  onEvent(listener: (event: SynthEvent) => void): () => void;
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
  private readonly listeners = new Set<(event: SynthEvent) => void>();
  private unlocking: Promise<void> | null = null;

  constructor(private readonly workletUrl?: string) {}

  get ready(): boolean {
    return this.node !== null;
  }

  unlock(): Promise<void> {
    // Only the browser suspends the context (hidden tab, lost device), and only a gesture resumes
    // it.
    if (this.node) {
      return this.ctx?.state === 'suspended' ? this.ctx.resume() : Promise.resolve();
    }
    // Shared by concurrent gestures; cleared on failure so the next gesture can retry.
    this.unlocking ??= this.init().catch((error: unknown) => {
      this.unlocking = null;
      throw error;
    });
    return this.unlocking;
  }

  post(cmd: SynthCommand): void {
    if (this.node) {
      this.node.port.postMessage(cmd);
      return;
    }
    switch (cmd.type) {
      case 'library':
      case 'mixer':
      case 'sample':
      case 'monitor':
        this.queue.push(cmd);
        break;
      // Only the last transport command is kept: each one supersedes the previous.
      case 'play_song':
      case 'stop_music':
      case 'stop_all':
        this.pendingTransport = cmd;
        // A stop resets the hold as well, the way it does in the worklet.
        if (cmd.type === 'stop_all') {
          this.pendingPause = false;
        }
        break;
      // Only the last one-shot is kept, so a game firing one per frame before the unlock plays one,
      // not a burst.
      case 'play_sfx':
        this.pendingSfx = cmd;
        break;
      // Only the last word on the hold, replayed after the transport it holds.
      case 'pause':
        this.pendingPause = true;
        break;
      case 'resume':
        this.pendingPause = false;
        break;
    }
  }

  onEvent(listener: (event: SynthEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
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
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    const url =
      this.workletUrl ??
      URL.createObjectURL(new Blob([SYNTH_WORKLET_SOURCE], { type: 'text/javascript' }));
    await ctx.audioWorklet.addModule(url);
    const node = new AudioWorkletNode(ctx, 'naucto-synth', { outputChannelCount: [2] });
    node.port.onmessage = (event: MessageEvent<SynthEvent>) => {
      this.listeners.forEach((listener) => {
        listener(event.data);
      });
    };
    node.connect(ctx.destination);
    this.node = node;
    for (const cmd of this.queue) {
      node.port.postMessage(cmd);
    }
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
