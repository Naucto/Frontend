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

/** AudioContext + AudioWorkletNode hosting the synth. Commands sent before unlock are queued. */
export class WebAudioBackend implements AudioBackend {
  private ctx: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private readonly queue: SynthCommand[] = [];
  private readonly listeners = new Set<(e: SynthEvent) => void>();
  private unlocking: Promise<void> | null = null;

  constructor(private readonly workletUrl?: string) {}

  get ready(): boolean {
    return this.node !== null;
  }

  unlock(): Promise<void> {
    if (this.node) return Promise.resolve();
    this.unlocking ??= this.init();
    return this.unlocking;
  }

  post(cmd: SynthCommand): void {
    if (this.node) this.node.port.postMessage(cmd);
    else {
      // Keep the latest library/mixer and drop stale notes so a late unlock does not burst.
      if (cmd.type === 'library' || cmd.type === 'mixer' || cmd.type === 'sample')
        this.queue.push(cmd);
    }
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
  }
}
