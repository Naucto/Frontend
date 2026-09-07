import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  output,
} from '@angular/core';
import { type Envelope } from '@naucto/engine';

/** Which handle a pointer grabbed, and therefore which envelope fields it edits. */
type Handle = 'attack' | 'decay' | 'release';

/** How long the note is held at sustain, in the drawing only. */
const HOLD = 0.4;
/** Longest attack / decay / release the graph can express by dragging. */
const MAX_STAGE = 2;

/**
 * ADSR curve on an LCD surface, with draggable handles.
 *
 * The sliders below it stay the precise control; this is the one you reach for when you are
 * listening rather than reading — which is why the peak handle moves attack horizontally and
 * sustain vertically at once.
 */
@Component({
  selector: 'nc-envelope-graph',
  template: `
    <svg
      viewBox="0 0 200 60"
      class="block h-[96px] w-full touch-none rounded-xs bg-lcd"
      role="group"
      [attr.aria-label]="label()"
      (pointerdown)="onDown($event)"
      (pointermove)="onMove($event)"
      (pointerup)="onUp($event)"
      (pointercancel)="onUp($event)"
    >
      <polygon [attr.points]="points()" class="fill-lcd-ink/20" />
      <polyline
        [attr.points]="points()"
        fill="none"
        class="stroke-lcd-ink"
        stroke-width="1.5"
        shape-rendering="crispEdges"
      />
      @for (h of handles(); track h.kind) {
        <rect
          [attr.x]="h.x - 3"
          [attr.y]="h.y - 3"
          width="6"
          height="6"
          class="cursor-grab fill-lcd-ink"
          [class.cursor-grabbing]="dragging === h.kind"
        />
      }
    </svg>
  `,
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EnvelopeGraphComponent {
  readonly env = input.required<Envelope>();
  readonly label = input('Envelope');
  readonly envChange = output<Partial<Envelope>>();

  private readonly host = inject<ElementRef<SVGSVGElement>>(ElementRef);
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
    this.host.nativeElement.setPointerCapture(e.pointerId);
  }

  protected onMove(e: PointerEvent): void {
    const kind = this.dragging;
    if (!kind) return;
    e.preventDefault();
    const { x, y } = this.toViewBox(e);
    const env = this.env();
    // Seconds under the pointer, measured from the start of whichever stage is being dragged.
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
    this.host.nativeElement.releasePointerCapture(e.pointerId);
  }

  /** Client coordinates into the 200×60 viewBox, so the graph can be any rendered size. */
  private toViewBox(e: PointerEvent): { x: number; y: number } {
    const r = this.host.nativeElement.getBoundingClientRect();
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
