import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  untracked,
} from '@angular/core';
import { type Instrument, type Note, type Pattern, VOICES } from '@naucto/engine';

import { KEY_W, MAX_STEPS } from './piano-roll.component';

const RULER_H = 16;
/** 118px of lane in the design; the voice rows share what is left under the ruler. */
export const LANE_TOTAL_H = 118;
const LANE_H = (LANE_TOTAL_H - RULER_H) / VOICES;

/**
 * Notes as the synth will actually sound them: a chord under an arpeggiating instrument is one
 * voice walking it, so it counts once, from its lowest note and for as long as its longest.
 */
function sounds(
  notes: readonly Note[],
  instruments: ReadonlyMap<string, Instrument>,
): readonly Note[] {
  const groups = new Map<string, Note[]>();
  for (const n of notes) {
    const key = `${n.instrument}:${String(n.step)}`;
    const held = groups.get(key);
    if (held) held.push(n);
    else groups.set(key, [n]);
  }
  const out: Note[] = [];
  for (const group of groups.values()) {
    const first = group[0];
    if (!first) continue;
    if (group.length < 2 || !((instruments.get(first.instrument)?.arp.rate ?? 0) > 0)) {
      out.push(...group);
      continue;
    }
    const root = group.reduce((low, n) => (n.pitch < low.pitch ? n : low), first);
    out.push({ ...root, length: Math.max(...group.map((n) => n.length)) });
  }
  return out;
}

/** Which of the five voices each note lands on, the way the synth allocates them. */
export function allocateVoices(
  notes: readonly Note[],
  instruments: ReadonlyMap<string, Instrument>,
): { note: Note; voice: number }[] {
  const ends = Array.from({ length: VOICES }, () => -1);
  const out: { note: Note; voice: number }[] = [];
  for (const note of [...sounds(notes, instruments)].sort((a, b) => a.step - b.step)) {
    let voice = ends.findIndex((e) => e <= note.step);
    if (voice < 0) voice = ends.indexOf(Math.min(...ends));
    ends[voice] = note.step + note.length;
    out.push({ note, voice });
  }
  return out;
}

interface Bar {
  key: string;
  left: number;
  top: number;
  width: number;
  colour: string;
}

/** VOICES lane under the piano roll: five rows, one bar per note in its voice. */
@Component({
  selector: 'nc-voices-lane',
  template: `
    <div class="relative flex" [style.height.px]="height">
      <div class="sticky left-0 z-10 shrink-0 bg-panel" [style.width.px]="KEY_W">
        <div
          class="font-mono text-[10px] leading-none text-ink-4"
          [style.height.px]="RULER_H"
          [style.padding-left.px]="4"
          [style.padding-top.px]="3"
        >
          VOICES
        </div>
        @for (v of voices(); track v.index) {
          <div
            class="flex items-center font-mono text-[10px] leading-none"
            [class]="v.active ? 'text-jade-ink' : 'text-ink-4'"
            [style.height.px]="LANE_H"
            [style.padding-left.px]="4"
          >
            V{{ v.index + 1 }}
          </div>
        }
      </div>
      <div
        class="relative shrink-0"
        [style.width.px]="trackWidth()"
        role="img"
        [attr.aria-label]="label()"
      >
        @for (b of bars(); track b.key) {
          <div
            class="absolute"
            [style.left.px]="b.left"
            [style.top.px]="b.top"
            [style.width.px]="b.width"
            [style.height.px]="LANE_H - 4"
            [style.background]="b.colour"
          ></div>
        }
        @let x = playheadX();
        @if (x !== null) {
          <div class="absolute top-0 bottom-0 w-px bg-hot" [style.left.px]="x"></div>
        }
      </div>
    </div>
  `,
  // No vertical overflow here, so height this strip loses is height it cuts. It keeps its own and
  // leaves the squeeze to whatever it is stacked against.
  host: { class: 'block shrink-0 overflow-x-hidden border-t border-line bg-panel' },
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
  /**
   * Where the roll above has been scrolled to, in pixels.
   *
   * The lane has no scrollbar of its own: a bar has to sit under the note that lit it, and two
   * boxes a person can scroll independently cannot promise that.
   */
  readonly scrollLeft = input(0);

  protected readonly height = LANE_TOTAL_H;
  protected readonly KEY_W = KEY_W;
  protected readonly RULER_H = RULER_H;
  protected readonly LANE_H = LANE_H;

  /** The roll's whole placeable grid, so a voice lines up with the note that lit it. */
  protected readonly trackWidth = computed(() => MAX_STEPS * this.stepWidth());

  protected readonly voices = computed(() =>
    Array.from({ length: VOICES }, (_, index) => ({
      index,
      active: this.active()[index] ?? false,
    })),
  );

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    effect(() => {
      const x = this.scrollLeft();
      untracked(() => {
        this.host.nativeElement.scrollLeft = x;
      });
    });
  }

  protected readonly bars = computed<Bar[]>(() => {
    const sw = this.stepWidth();
    const pal = this.palette();
    const insts = this.instruments();
    return allocateVoices(this.pattern().notes, insts).map(({ note, voice }, i) => ({
      key: `${String(i)}:${String(note.step)}:${String(note.pitch)}`,
      left: note.step * sw,
      top: RULER_H + voice * LANE_H + 2,
      width: Math.max(2, note.length * sw - 1),
      colour: pal[insts.get(note.instrument)?.colour ?? 4] ?? pal[0] ?? 'transparent',
    }));
  });

  protected readonly playheadX = computed(() => {
    const ph = this.playhead();
    return ph === null ? null : Math.floor(ph * this.stepWidth());
  });
}
