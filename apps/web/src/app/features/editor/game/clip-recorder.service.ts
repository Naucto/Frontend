import { DestroyRef, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { projectControllerUploadClip } from '@naucto/api-client';

import { ApiError, unwrap } from '../../../core/api/api-errors';
import { RuntimeHostService } from '../../../shared/game-screen/runtime-host.service';
import { SessionSaveService } from '../work-session/session-save.service';
import { WorkSessionService } from '../work-session/work-session.service';

/** The longest a clip runs, in seconds. */
export const CLIP_SECONDS = 25;

/** The size the API refuses a clip past. */
const CLIP_MAX_BYTES = 4 * 1024 * 1024;

/**
 * What the encoder aims for: a clip of {@link CLIP_SECONDS} at this rate weighs under a third of
 * {@link CLIP_MAX_BYTES}, and 320×180 of flat colour stays sharp on far less. The margin is the
 * encoder's, which runs at twice its target on a screen redrawn at random every frame.
 */
const CLIP_BITS_PER_SECOND = 400_000;

const CLIP_FRAMES_PER_SECOND = 30;

/** In the order they are tried: the first one this browser records wins. */
const CLIP_TYPES = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/mp4'];

/** Why there is no clip where one was asked for. */
export type ClipIssue =
  'idle' | 'paused' | 'halted' | 'unsupported' | 'empty' | 'too-large' | 'refused';

/**
 * Records the editor's running game as the project's clip: the canvas as it is drawn, without
 * sound, for {@link CLIP_SECONDS} at most. A recording follows the game: one that stops running
 * ends the recording, since a canvas nobody draws to gives no frames.
 */
@Injectable()
export class ClipRecorder {
  private readonly runtime = inject(RuntimeHostService);
  private readonly session = inject(WorkSessionService);
  private readonly saves = inject(SessionSaveService);

  readonly phase = signal<'ready' | 'recording' | 'saving'>('ready');
  /** How long the recording has run, in seconds. */
  readonly elapsed = signal(0);
  readonly issue = signal<ClipIssue | null>(null);
  /** What is being recorded, for a picture of it beside the controls. */
  readonly stream = signal<MediaStream | null>(null);
  /** The weight of the clip a recording just made, which the server does not say of a stored one. */
  readonly recordedBytes = signal<number | null>(null);

  private recorder: MediaRecorder | null = null;
  private clock: ReturnType<typeof setInterval> | undefined;
  /** Set when the page is left mid-recording: what was captured is dropped, not sent. */
  private dropped = false;

  private async save(clip: Blob): Promise<void> {
    if (clip.size === 0) {
      this.issue.set('empty');
      return;
    }
    if (clip.size > CLIP_MAX_BYTES) {
      this.issue.set('too-large');
      return;
    }
    this.phase.set('saving');
    try {
      unwrap(
        await projectControllerUploadClip({ path: { id: this.session.id }, body: { file: clip } }),
      );
      this.recordedBytes.set(clip.size);
      await this.saves.refreshProject();
    } catch (error) {
      this.issue.set(error instanceof ApiError && error.status === 413 ? 'too-large' : 'refused');
    } finally {
      this.phase.set('ready');
    }
  }

  /** Ends the recording early; what was captured so far is the clip. */
  stop(): void {
    clearInterval(this.clock);
    this.clock = undefined;
    if (this.recorder?.state === 'recording') {
      this.recorder.stop();
    }
    this.recorder = null;
  }

  start(): void {
    this.issue.set(null);
    const canvas = this.runtime.canvas();
    const state = this.runtime.state();
    if (!canvas || state !== 'running') {
      this.issue.set(state === 'paused' || state === 'halted' ? state : 'idle');
      return;
    }
    const type =
      typeof MediaRecorder === 'undefined'
        ? undefined
        : CLIP_TYPES.find((candidate) => MediaRecorder.isTypeSupported(candidate));
    if (!type || typeof canvas.captureStream !== 'function') {
      this.issue.set('unsupported');
      return;
    }
    const stream = canvas.captureStream(CLIP_FRAMES_PER_SECOND);
    const recorder = new MediaRecorder(stream, {
      mimeType: type,
      videoBitsPerSecond: CLIP_BITS_PER_SECOND,
    });
    const chunks: Blob[] = [];
    const startedAt = performance.now();
    recorder.addEventListener('dataavailable', (event) => {
      chunks.push(event.data);
    });
    recorder.addEventListener('stop', () => {
      for (const track of stream.getTracks()) {
        track.stop();
      }
      this.stream.set(null);
      this.phase.set('ready');
      if (!this.dropped) {
        // The container alone: the API names the two it takes, and a codec suffix is neither.
        const container = type.split(';')[0];
        void this.save(new Blob(chunks, { type: container }));
      }
    });
    this.recorder = recorder;
    this.stream.set(stream);
    this.elapsed.set(0);
    this.phase.set('recording');
    recorder.start();
    this.clock = setInterval(() => {
      const seconds = (performance.now() - startedAt) / 1000;
      this.elapsed.set(Math.min(CLIP_SECONDS, seconds));
      if (seconds >= CLIP_SECONDS) {
        this.stop();
      }
    }, 100);
  }

  constructor() {
    effect(() => {
      const state = this.runtime.state();
      untracked(() => {
        if (state !== 'running' && this.phase() === 'recording') {
          this.stop();
        }
      });
    });
    inject(DestroyRef).onDestroy(() => {
      this.dropped = true;
      this.stop();
    });
  }
}
