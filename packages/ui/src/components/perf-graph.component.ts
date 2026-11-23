import type { ElementRef } from '@angular/core';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  signal,
  viewChild,
} from '@angular/core';

/** How a reading stands against its limits: within them, close to one, or past it. */
export type PerfTone = 'ok' | 'warn' | 'over';

/** The tone of every reading from `from` (inclusive) up to `to` (exclusive). */
export interface PerfBand {
  from: number;
  to: number;
  tone: PerfTone;
}

const PAINT: Record<PerfTone, string> = {
  ok: 'var(--color-lcd-ink)',
  warn: 'var(--color-orange)',
  over: 'var(--color-hot)',
};

const INK: Record<PerfTone, string> = {
  ok: 'text-lcd-ink',
  warn: 'text-orange-ink',
  over: 'text-hot-ink',
};

const RANK: Record<PerfTone, number> = { ok: 0, warn: 1, over: 2 };

/** One sample is two kit pixels wide; heights move by whole kit pixels. */
const COLUMN = 6;
const PX = 3;

/**
 * A reading over time, as the console's LCD draws it: its name and current value over a stepped
 * graph in an inset well. Each sample, and the value, takes the colour of the band it stands in,
 * and each boundary between two bands is a dashed line in the worse one's colour.
 * The well fills the height it is given; the newest sample sits at its right edge.
 */
@Component({
  selector: 'nc-perf-graph',
  templateUrl: './perf-graph.component.html',
  host: { class: 'flex min-h-[72px] flex-col gap-[6px] font-ui' },
  styles: `
    .grid-lines {
      background-image: linear-gradient(var(--color-line) 0 3px, transparent 3px);
      background-position: 0 3px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PerfGraphComponent {
  readonly label = input.required<string>();
  /** What the header shows, already formatted: the graph does not know the unit. */
  readonly value = input.required<string>();
  /** Oldest first. Only as many as fit the well are drawn. */
  readonly samples = input.required<readonly number[]>();
  /** The reading at the top of the well; anything above it is drawn at the top. */
  readonly max = input.required<number>();
  readonly bands = input<readonly PerfBand[]>([
    { from: Number.NEGATIVE_INFINITY, to: Number.POSITIVE_INFINITY, tone: 'ok' },
  ]);

  private readonly well = viewChild.required<ElementRef<HTMLElement>>('well');
  private readonly size = signal({ width: 0, height: 0 });

  protected readonly width = computed(() => this.size().width);
  /** Whole kit pixels, so every step and every grid line lands on one. */
  protected readonly height = computed(() => Math.floor(this.size().height / PX) * PX);
  protected readonly gridStep = computed(() =>
    Math.max(PX, Math.round(this.height() / 4 / PX) * PX),
  );

  private readonly toneOf = (value: number): PerfTone =>
    this.bands().find((band) => value >= band.from && value < band.to)?.tone ?? 'ok';

  /** How tall a reading stands: one kit pixel at least, so a zero still shows as a floor. */
  private readonly rise = (value: number): number =>
    Math.max(
      PX,
      Math.round((Math.min(1, Math.max(0, value) / this.max()) * (this.height() - PX)) / PX) * PX,
    );

  protected readonly tone = computed(() => {
    const last = this.samples().at(-1);
    return last === undefined ? 'ok' : this.toneOf(last);
  });
  protected readonly ink = computed(() => INK[this.tone()]);

  /**
   * The area under the graph and its top edge, with the riser between two steps, one pair of paths
   * per tone: each column takes the colour of its own sample's band.
   */
  protected readonly paths = computed(() => {
    const height = this.height();
    const shown = this.samples().slice(-Math.floor(this.width() / COLUMN));
    const start = this.width() - shown.length * COLUMN;
    const drawn: Record<PerfTone, { fill: string; line: string }> = {
      ok: { fill: '', line: '' },
      warn: { fill: '', line: '' },
      over: { fill: '', line: '' },
    };
    const rises = shown.map(this.rise);
    shown.forEach((value, i) => {
      const rise = rises[i] ?? PX;
      const x = start + i * COLUMN;
      const before = rises[i - 1] ?? rise;
      const low = Math.min(rise, before);
      const high = Math.max(rise, before);
      const paint = drawn[this.toneOf(value)];
      paint.fill += `M${String(x)} ${String(height - rise)}h${String(COLUMN)}v${String(rise)}h-${String(COLUMN)}z`;
      paint.line += `M${String(x)} ${String(height - rise)}h${String(COLUMN)}v${String(PX)}h-${String(COLUMN)}z`;
      if (high > low) {
        paint.line += `M${String(x)} ${String(height - high)}h${String(PX)}v${String(high - low + PX)}h-${String(PX)}z`;
      }
    });
    return (Object.keys(drawn) as PerfTone[])
      .filter((tone) => drawn[tone].fill)
      .map((tone) => ({ ...drawn[tone], color: PAINT[tone] }));
  });

  /** A dashed line at every boundary the well can show, in the colour of the worse side. */
  protected readonly limits = computed(() => {
    const height = this.height();
    const sorted = [...this.bands()].sort((a, b) => a.from - b.from);
    return sorted.slice(1).flatMap((band, i) => {
      const below = sorted[i];
      if (!below || band.from <= 0 || band.from >= this.max()) {
        return [];
      }
      const worse = RANK[band.tone] > RANK[below.tone] ? band.tone : below.tone;
      const y = height - this.rise(band.from);
      let dashes = '';
      for (let x = 0; x < this.width(); x += COLUMN * 2) {
        dashes += `M${String(x)} ${String(y)}h${String(COLUMN)}v${String(PX)}h-${String(COLUMN)}z`;
      }
      return [{ dashes, color: PAINT[worse] }];
    });
  });

  constructor() {
    effect((onCleanup) => {
      const well = this.well().nativeElement;
      if (typeof ResizeObserver === 'undefined') {
        return;
      }
      const watch = new ResizeObserver(() => {
        this.size.set({ width: well.clientWidth, height: well.clientHeight });
      });
      watch.observe(well);
      onCleanup(() => {
        watch.disconnect();
      });
    });
  }
}
