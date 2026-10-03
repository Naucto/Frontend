import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { type Envelope } from '@naucto/engine';

/** Which handle a pointer grabbed, and therefore which envelope fields it edits. */
type Handle = 'attack' | 'decay' | 'release';

/** How long the note is held at sustain, in the drawing only. */
const HOLD = 0.4;
/** Longest attack / decay / release the graph can express by dragging. */
const MAX_STAGE = 2;

/** ADSR curve on an LCD surface, with draggable handles for adjusting by ear. */
@Component({
  selector: 'nc-envelope-graph',
  templateUrl: './envelope-graph.component.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EnvelopeGraphComponent {
  readonly env = input.required<Envelope>();
  readonly label = input.required<string>();
  readonly envChange = output<Partial<Envelope>>();

  protected dragging: Handle | null = null;

  private readonly total = computed(() => {
    const { attack, decay, release } = this.env();
    return Math.max(0.05, attack + decay + HOLD + release);
  });

  protected readonly dots = computed(() => {
    const { attack, decay, sustain } = this.env();
    return [
      { x: this.toX(0), y: this.toY(0) },
      { x: this.toX(attack), y: this.toY(1) },
      { x: this.toX(attack + decay), y: this.toY(sustain) },
      { x: this.toX(attack + decay + HOLD), y: this.toY(sustain) },
      { x: this.toX(this.total()), y: this.toY(0) },
    ];
  });

  /** The three points worth grabbing: the peak, the sustain corner, and the end of the tail. */
  protected readonly handles = computed<{ kind: Handle; x: number; y: number }[]>(() => {
    const d = this.dots();
    return [
      { kind: 'attack', x: d[1]?.x ?? 0, y: d[1]?.y ?? 0 },
      { kind: 'decay', x: d[2]?.x ?? 0, y: d[2]?.y ?? 0 },
      { kind: 'release', x: d[4]?.x ?? 0, y: d[4]?.y ?? 0 },
    ];
  });

  protected readonly points = computed(() =>
    this.dots()
      .map((p) => `${String(p.x)},${String(p.y)}`)
      .join(' '),
  );

  protected onDown(e: PointerEvent): void {
    const { x, y } = this.toViewBox(e);
    const near = this.handles().find((h) => Math.abs(h.x - x) < 8 && Math.abs(h.y - y) < 8);
    if (!near) return;
    e.preventDefault();
    this.dragging = near.kind;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }

  protected onMove(e: PointerEvent): void {
    const kind = this.dragging;
    if (!kind) return;
    e.preventDefault();
    const { x, y } = this.toViewBox(e);
    const env = this.env();
    // Seconds under the pointer, from the start of the envelope.
    const seconds = ((x - 4) / 192) * this.total();
    const level = Math.max(0, Math.min(1, (56 - y) / 52));

    if (kind === 'attack') {
      this.envChange.emit({ attack: clampStage(seconds) });
      return;
    }
    if (kind === 'decay') {
      // The sustain corner carries both: how long the decay takes, and where it lands.
      this.envChange.emit({ decay: clampStage(seconds - env.attack), sustain: level });
      return;
    }
    this.envChange.emit({ release: clampStage(seconds - env.attack - env.decay - HOLD) });
  }

  protected onUp(e: PointerEvent): void {
    if (!this.dragging) return;
    this.dragging = null;
    (e.currentTarget as Element).releasePointerCapture(e.pointerId);
  }

  /** Client coordinates into the 200×60 viewBox, so the graph can be any rendered size. */
  private toViewBox(e: PointerEvent): { x: number; y: number } {
    const r = (e.currentTarget as Element).getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * 200,
      y: ((e.clientY - r.top) / r.height) * 60,
    };
  }

  private toX(t: number): number {
    return 4 + (t / this.total()) * 192;
  }

  private toY(v: number): number {
    return 56 - v * 52;
  }
}

function clampStage(seconds: number): number {
  return Math.max(0, Math.min(MAX_STAGE, Math.round(seconds * 1000) / 1000));
}
