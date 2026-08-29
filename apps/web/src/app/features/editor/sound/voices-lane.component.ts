import type { ElementRef } from '@angular/core';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  untracked,
  viewChild,
} from '@angular/core';
import { cssVar } from '@app/shared/pixel/pixel-tools';
import { type Instrument, type Note, type Pattern, VOICES } from '@naucto/engine';

import { KEY_W } from './piano-roll.component';

const RULER_H = 16;
/** 118px of lane in the design; the voice rows share what is left under the ruler. */
export const LANE_TOTAL_H = 118;

/** Which of the five voices each note lands on, the way the synth allocates them. */
export function allocateVoices(notes: readonly Note[]): { note: Note; voice: number }[] {
  const ends = Array.from({ length: VOICES }, () => -1);
  const out: { note: Note; voice: number }[] = [];
  for (const note of [...notes].sort((a, b) => a.step - b.step)) {
    let voice = ends.findIndex((e) => e <= note.step);
    if (voice < 0) voice = ends.indexOf(Math.min(...ends));
    ends[voice] = note.step + note.length;
    out.push({ note, voice });
  }
  return out;
}

/** VOICES lane under the piano roll: five rows, one bar per note in its voice. */
@Component({
  selector: 'nc-voices-lane',
  template: `
    <canvas
      #canvas
      class="pixelated block"
      [width]="width()"
      [height]="height"
      role="img"
      [attr.aria-label]="label()"
    ></canvas>
  `,
  host: { class: 'block overflow-x-auto border-t border-line bg-panel' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VoicesLaneComponent {
  readonly pattern = input.required<Pattern>();
  readonly instruments = input.required<Map<string, Instrument>>();
  readonly palette = input.required<readonly string[]>();
  readonly zoom = input<1 | 2>(1);
  readonly stepWidth = input(24);
  readonly playhead = input<number | null>(null);
  readonly active = input<readonly boolean[]>([]);
  readonly label = input('Voices');
  protected readonly height = LANE_TOTAL_H;
  private readonly laneH = (LANE_TOTAL_H - RULER_H) / VOICES;
  protected readonly width = computed(() => KEY_W + this.pattern().steps * this.stepWidth());
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private raf = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      cancelAnimationFrame(this.raf);
    });
    effect(() => {
      this.pattern();
      this.instruments();
      this.palette();
      this.stepWidth();
      this.playhead();
      this.active();
      untracked(() => {
        cancelAnimationFrame(this.raf);
        this.raf = requestAnimationFrame(() => {
          this.draw();
        });
      });
    });
  }

  private draw(): void {
    const el = this.canvas().nativeElement;
    const ctx = el.getContext('2d');
    if (!ctx) return;
    const sw = this.stepWidth();
    const w = this.width();
    ctx.fillStyle = cssVar(el, '--nc-panel');
    ctx.fillRect(0, 0, w, this.height);
    ctx.font = `10px ${cssVar(el, '--font-mono')}`;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = cssVar(el, '--nc-ink-4');
    ctx.fillText('VOICES', 4, 8);
    const active = this.active();
    for (let v = 0; v < VOICES; v++) {
      ctx.fillStyle = active[v] ? cssVar(el, '--nc-jade-ink') : cssVar(el, '--nc-ink-4');
      ctx.fillText(`V${String(v + 1)}`, 4, RULER_H + v * this.laneH + this.laneH / 2);
    }
    const pal = this.palette();
    const insts = this.instruments();
    for (const { note, voice } of allocateVoices(this.pattern().notes)) {
      ctx.fillStyle = pal[insts.get(note.instrument)?.colour ?? 4] ?? '#fff';
      ctx.fillRect(
        KEY_W + note.step * sw,
        RULER_H + voice * this.laneH + 2,
        Math.max(2, note.length * sw - 1),
        this.laneH - 4,
      );
    }
    const ph = this.playhead();
    if (ph !== null) {
      ctx.fillStyle = cssVar(el, '--nc-hot');
      ctx.fillRect(Math.floor(KEY_W + ph * sw), 0, 1, this.height);
    }
  }
}
