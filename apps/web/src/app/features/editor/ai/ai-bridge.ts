import { unwrap } from '@app/core/api/api-errors';
import {
  type AiBarrierResponseDto,
  aiControllerAcknowledge,
  aiControllerHeartbeat,
  aiControllerViolation,
} from '@naucto/api-client';
import { encodeState } from '@naucto/engine';
import * as Y from 'yjs';

export type AiBarrier = AiBarrierResponseDto;

/** Origin of the committed result when it is applied, so it is never reported as a late write. */
const RESULT_ORIGIN = 'ai-result';

const toBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));

  return btoa(binary);
};

/**
 * One browser's part in applying an approved change. Every open editor runs one, whether or not
 * its AI dialog is open: it heartbeats so the backend knows who must pause, freezes and sends its
 * state when asked, reports anything that reaches the document after that, and takes the committed
 * result in when it lands.
 */
export class AiBridge {
  private interval: ReturnType<typeof setInterval> | null = null;
  private busy = false;
  private closed = false;
  private acknowledged = '';
  private received = '';
  /** The barrier whose pause this editor is holding, while it holds it. */
  private holding: string | null = null;
  private readonly watcher = (update: Uint8Array, origin: unknown): void => {
    const barrier = this.holding;
    if (!barrier || origin === RESULT_ORIGIN) return;
    void aiControllerViolation({
      path: { projectId: this.projectId, barrierId: barrier },
      body: {
        editorId: this.editorId,
        reason:
          origin === null || typeof origin === 'object'
            ? 'peer update after pause'
            : 'local update after pause',
        update: toBase64(update),
      },
    }).catch(() => {
      // Unreported, the barrier finishes on the snapshots alone; the result's own check catches it.
    });
  };

  constructor(
    private readonly doc: Y.Doc,
    private readonly projectId: number,
    readonly editorId: string,
    private readonly onBarrier: (barrier: AiBarrier | null) => void,
    private readonly onError: (message: string) => void,
  ) {
    doc.on('update', this.watcher);
  }

  async start(): Promise<void> {
    await this.poll();
    this.interval = setInterval(() => {
      void this.poll().catch((error: unknown) => {
        this.onError(error instanceof Error ? error.message : String(error));
      });
    }, 1500);
  }

  close(): void {
    this.closed = true;
    this.doc.off('update', this.watcher);
    if (this.interval) clearInterval(this.interval);
  }

  async poll(): Promise<void> {
    if (this.busy || this.closed) return;
    this.busy = true;
    try {
      const raw = unwrap(
        await aiControllerHeartbeat({
          path: { projectId: this.projectId },
          body: { editorId: this.editorId },
        }),
      ) as AiBarrier | null | undefined;
      // An empty body is how the API answers "no barrier".
      const barrier = raw && typeof raw === 'object' && 'id' in raw ? raw : null;
      if (this.closed) return;
      if (barrier?.status === 'APPLIED' && barrier.result && this.received !== barrier.id) {
        Y.applyUpdate(
          this.doc,
          Uint8Array.from(atob(barrier.result), (c) => c.charCodeAt(0)),
          RESULT_ORIGIN,
        );
        this.received = barrier.id;
      }
      if (!barrier || barrier.status === 'APPLIED' || barrier.status === 'ABORTED')
        this.holding = null;
      this.onBarrier(barrier);
      this.onError('');
      if (
        barrier?.status === 'PREPARING' &&
        barrier.expected.includes(this.editorId) &&
        this.acknowledged !== barrier.id
      ) {
        // The editing surfaces unmount on the pause; wait two frames so none is mid-gesture, then
        // hold: everything that reaches the document from here on is reported, not silently kept.
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              resolve();
            });
          });
        });
        if (this.closed) return;
        this.holding = barrier.id;
        unwrap(
          await aiControllerAcknowledge({
            path: { projectId: this.projectId, barrierId: barrier.id },
            body: { editorId: this.editorId, snapshot: encodeState(this.doc) },
          }),
        );
        this.acknowledged = barrier.id;
      }
    } finally {
      this.busy = false;
    }
  }
}
