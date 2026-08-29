import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { cssVar } from '@app/shared/pixel/pixel-tools';
import { type Instrument, midiToNoteName, type Note, type Pattern } from '@naucto/engine';
import { PresenceFlagComponent } from '@naucto/ui';

import { type Collaborator } from '../work-session/work-session.service';

export const PITCH_MIN = 24;
export const PITCH_MAX = 95;
// Measured off the artboard: a 20px row is tall enough to grab a note by its edge, and 52px of
// key column fits "C#4" without crowding the grid.
export const ROW_H = 20;
/**
 * The black key, measured off the artboard: 34 of the 52-wide column, leaving the white bed showing
 * to its right. Fixed rather than themed — see the note in `draw()`.
 */
const BLACK_KEY_W = 34;
const BLACK_KEY = '#17140f';
/** The artboard insets the note name this far into the key. */
const KEY_LABEL_X = 7;
export const KEY_W = 52;
export const RULER_H = 24;
const BLACK = new Set([1, 3, 6, 8, 10]);

interface Drag {
  mode: 'create' | 'move' | 'resize';
  index: number;
  startStep: number;
  startPitch: number;
  original: Note;
}

/** The pattern grid: pitches down, steps across; notes are painted with their instrument's colour. */
@Component({
  selector: 'nc-piano-roll',
  imports: [PresenceFlagComponent],
  template: `
    <div class="relative" [style.width.px]="width()" [style.height.px]="height()">
      <canvas
        #canvas
        class="pixelated block cursor-crosshair touch-none"
        [width]="width()"
        [height]="height()"
        role="img"
        [attr.aria-label]="label()"
        (pointerdown)="onDown($event)"
        (pointermove)="onMove($event)"
        (pointerup)="onUp()"
        (pointercancel)="onUp()"
        (pointerleave)="onLeave()"
        (contextmenu)="$event.preventDefault()"
      ></canvas>
      @for (f of flags(); track f.clientId) {
        <nc-presence-flag
          class="absolute"
          [style.left.px]="f.x"
          [style.top.px]="f.y"
          [name]="f.name"
          [colour]="f.colour"
        />
      }
    </div>
  `,
  host: { class: 'block overflow-auto', tabindex: '0' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PianoRollComponent {
  readonly pattern = input.required<Pattern>();
  readonly instruments = input.required<Map<string, Instrument>>();
  readonly palette = input.required<readonly string[]>();
  readonly instrumentId = input<string | null>(null);
  /**
   * Notes per beat the grid snaps to; 0 places notes freely. A resolution, not a switch: the
   * denominator decides the step, so 1/8 and 1/16 are different grids rather than "on".
   */
  readonly snap = input<number>(4);
  readonly zoom = input<1 | 2>(1);
  readonly playhead = input<number | null>(null);
  readonly collaborators = input<readonly Collaborator[]>([]);
  readonly label = input('Piano roll');
  readonly notesChange = output<Note[]>();
  readonly audition = output<{ instrument: string; pitch: number }>();
  readonly hover = output<{ step: number; pitch: number } | null>();

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly working = signal<Note[] | null>(null);
  private readonly hoverCell = signal<{ step: number; pitch: number } | null>(null);
  private drag: Drag | null = null;
  private raf = 0;

  private readonly hostWidth = signal(0);
  /** Scroll offsets, so the ruler and the key column can be redrawn where they stay in view. */
  private readonly scrollX = signal(0);
  private readonly scrollY = signal(0);
  /** Steps stretch to fill the roll; zoom doubles that. */
  readonly stepW = computed(() =>
    Math.max(
      24 * this.zoom(),
      Math.floor(((this.hostWidth() - KEY_W - 2) * this.zoom()) / this.pattern().steps),
    ),
  );
  protected readonly width = computed(() => KEY_W + this.pattern().steps * this.stepW());
  protected readonly height = computed(() => RULER_H + (PITCH_MAX - PITCH_MIN + 1) * ROW_H);
  protected readonly flags = computed(() =>
    this.collaborators()
      .filter((c) => !c.isSelf && c.cursor?.tab === 'sound')
      .map((c) => ({
        clientId: c.clientId,
        name: c.name,
        colour: c.colour,
        x: KEY_W + (c.cursor?.x ?? 0) * this.stepW(),
        y: RULER_H + (PITCH_MAX - (c.cursor?.y ?? 0)) * ROW_H,
      })),
  );

  constructor() {
    const onScroll = (): void => {
      const el = this.host.nativeElement;
      this.scrollX.set(el.scrollLeft);
      this.scrollY.set(el.scrollTop);
    };
    this.host.nativeElement.addEventListener('scroll', onScroll, { passive: true });
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) this.hostWidth.set(w);
    });
    ro.observe(this.host.nativeElement);
    inject(DestroyRef).onDestroy(() => {
      this.host.nativeElement.removeEventListener('scroll', onScroll);
      ro.disconnect();
      cancelAnimationFrame(this.raf);
    });
    effect(() => {
      this.pattern();
      this.instruments();
      this.palette();
      this.instrumentId();
      this.zoom();
      this.playhead();
      this.working();
      this.hoverCell();
      this.scrollX();
      this.scrollY();
      untracked(() => {
        this.requestRedraw();
      });
    });
    // Start around C4 so the useful octaves are in view.
    queueMicrotask(() => {
      this.host.nativeElement.scrollTop = (PITCH_MAX - 72) * ROW_H - 120;
    });
  }

  // ---- pointer --------------------------------------------------------------

  private notes(): Note[] {
    return this.working() ?? this.pattern().notes;
  }

  private cellOf(e: PointerEvent): { step: number; pitch: number; x: number } {
    const r = this.canvas().nativeElement.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const step = Math.max(0, (x - KEY_W) / this.stepW());
    const pitch = Math.max(
      PITCH_MIN,
      Math.min(PITCH_MAX, PITCH_MAX - Math.floor((y - RULER_H) / ROW_H)),
    );
    return { step, pitch, x };
  }

  /** One snap unit in steps, given the pattern's own steps-per-beat. */
  private snapUnit(): number {
    const div = this.snap();
    if (!div) return 0;
    return Math.max(0.25, this.pattern().stepsPerBeat / div);
  }

  private snapStep(s: number): number {
    const unit = this.snapUnit();
    return unit ? Math.round(s / unit) * unit : Math.round(s * 4) / 4;
  }

  private hit(step: number, pitch: number): number {
    const notes = this.notes();
    for (let i = notes.length - 1; i >= 0; i--) {
      const n = notes[i];
      if (n?.pitch === pitch && step >= n.step && step < n.step + n.length) return i;
    }
    return -1;
  }

  protected onDown(e: PointerEvent): void {
    const { step, pitch, x } = this.cellOf(e);
    if (x < KEY_W) {
      const inst = this.instrumentId();
      if (inst) this.audition.emit({ instrument: inst, pitch });
      return;
    }
    this.host.nativeElement.focus({ preventScroll: true });
    const index = this.hit(step, pitch);
    const notes = [...this.notes()];
    if (e.button === 2) {
      if (index >= 0) {
        notes.splice(index, 1);
        this.notesChange.emit(notes);
      }
      return;
    }
    if (e.button !== 0) return;
    this.canvas().nativeElement.setPointerCapture(e.pointerId);
    if (index >= 0) {
      const n = notes[index];
      if (!n) return;
      const nearEnd = (n.step + n.length - step) * this.stepW() <= 6;
      this.drag = {
        mode: nearEnd ? 'resize' : 'move',
        index,
        startStep: step,
        startPitch: pitch,
        original: n,
      };
      this.working.set(notes);
      this.audition.emit({ instrument: n.instrument, pitch: n.pitch });
      return;
    }
    const inst = this.instrumentId();
    if (!inst) return;
    const note: Note = { step: this.snapStep(step), pitch, length: 1, instrument: inst, volume: 1 };
    notes.push(note);
    this.drag = {
      mode: 'create',
      index: notes.length - 1,
      startStep: step,
      startPitch: pitch,
      original: note,
    };
    this.working.set(notes);
    this.audition.emit({ instrument: inst, pitch });
  }

  protected onMove(e: PointerEvent): void {
    const { step, pitch, x } = this.cellOf(e);
    const cell = x < KEY_W ? null : { step: Math.floor(step), pitch };
    this.hoverCell.set(cell);
    this.hover.emit(cell);
    const d = this.drag;
    if (!d) return;
    const notes = [...this.notes()];
    const o = d.original;
    const max = this.pattern().steps;
    let n: Note;
    switch (d.mode) {
      case 'create':
      case 'resize': {
        const end = Math.max(
          o.step + (this.snapUnit() || 0.25),
          this.snapStep(step) + (this.snapUnit() || 0.25),
        );
        n = { ...o, length: Math.min(max - o.step, end - o.step) };
        break;
      }
      case 'move': {
        const ds = this.snapStep(step - d.startStep + o.step) - o.step;
        const ns = Math.max(0, Math.min(max - o.length, o.step + ds));
        n = {
          ...o,
          step: ns,
          pitch: Math.max(PITCH_MIN, Math.min(PITCH_MAX, o.pitch + (pitch - d.startPitch))),
        };
        if (n.pitch !== (notes[d.index]?.pitch ?? n.pitch))
          this.audition.emit({ instrument: n.instrument, pitch: n.pitch });
        break;
      }
    }
    notes[d.index] = n;
    this.working.set(notes);
  }

  protected onUp(): void {
    if (!this.drag) return;
    this.drag = null;
    const notes = this.working();
    this.working.set(null);
    if (notes) this.notesChange.emit(notes);
  }

  protected onLeave(): void {
    this.hoverCell.set(null);
    this.hover.emit(null);
  }

  // ---- drawing --------------------------------------------------------------

  private requestRedraw(): void {
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(() => {
      this.draw();
    });
  }

  private draw(): void {
    const el = this.canvas().nativeElement;
    const ctx = el.getContext('2d');
    if (!ctx) return;
    const p = this.pattern();
    const sw = this.stepW();
    const w = this.width();
    const h = this.height();
    const rows = PITCH_MAX - PITCH_MIN + 1;
    ctx.fillStyle = cssVar(el, '--nc-page');
    ctx.fillRect(0, 0, w, h);

    // Rows: black keys shaded.
    for (let r = 0; r < rows; r++) {
      const pitch = PITCH_MAX - r;
      const y = RULER_H + r * ROW_H;
      if (BLACK.has(pitch % 12)) {
        ctx.fillStyle = cssVar(el, '--nc-inset');
        ctx.fillRect(KEY_W, y, w - KEY_W, ROW_H);
      }
    }
    // Grid.
    ctx.strokeStyle = cssVar(el, '--nc-line');
    ctx.beginPath();
    for (let s = 0; s <= p.steps; s++) {
      if (s % p.stepsPerBeat === 0) continue;
      ctx.moveTo(KEY_W + s * sw + 0.5, RULER_H);
      ctx.lineTo(KEY_W + s * sw + 0.5, h);
    }
    for (let r = 0; r <= rows; r++) {
      ctx.moveTo(KEY_W, RULER_H + r * ROW_H + 0.5);
      ctx.lineTo(w, RULER_H + r * ROW_H + 0.5);
    }
    ctx.stroke();
    ctx.strokeStyle = cssVar(el, '--nc-line-strong');
    ctx.beginPath();
    for (let s = 0; s <= p.steps; s += p.stepsPerBeat) {
      ctx.moveTo(KEY_W + s * sw + 0.5, 0);
      ctx.lineTo(KEY_W + s * sw + 0.5, h);
    }
    ctx.stroke();

    // Notes.
    const pal = this.palette();
    const insts = this.instruments();
    const selected = this.instrumentId();
    for (const n of this.notes()) {
      const inst = insts.get(n.instrument);
      const colour = pal[inst?.colour ?? 4] ?? '#fff';
      const x = KEY_W + n.step * sw;
      const y = RULER_H + (PITCH_MAX - n.pitch) * ROW_H;
      ctx.globalAlpha = selected && n.instrument !== selected ? 0.55 : 1;
      ctx.fillStyle = colour;
      ctx.fillRect(x + 1, y + 1, Math.max(3, n.length * sw - 2), ROW_H - 2);
      ctx.globalAlpha = 1;
    }

    // Ruler and key column are drawn at the current scroll offset, so they stay pinned while the
    // grid scrolls under them — the same effect as position:sticky, on one canvas.
    const sx = this.scrollX();
    const sy = this.scrollY();
    ctx.fillStyle = cssVar(el, '--nc-panel');
    ctx.fillRect(KEY_W, sy, w - KEY_W, RULER_H);
    ctx.font = `10px ${cssVar(el, '--font-mono')}`;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = cssVar(el, '--nc-ink-4');
    for (let s = 0; s < p.steps; s += p.stepsPerBeat)
      ctx.fillText(String(s / p.stepsPerBeat + 1), KEY_W + s * sw + 4, sy + RULER_H / 2);

    // Keys column: a continuous white bed with the black keys laid over it, which is how a keyboard
    // is built and how the artboard draws it. Painting a dark bed and stamping only the white keys
    // onto it left a full-width gap wherever a black key sat, so the column read as a list of note
    // names floating on darkness rather than as a keyboard.
    //
    // The black key is a fixed near-black, not `--nc-sunken`: that token is #eee9de in daylight, so
    // a themed black key turned near-white on a near-white bed and the keyboard disappeared.
    for (let r = 0; r < rows; r++) {
      const pitch = PITCH_MAX - r;
      const y = RULER_H + r * ROW_H;
      const isC = pitch % 12 === 0;
      ctx.fillStyle = cssVar(el, isC ? '--nc-ink' : '--nc-ink-body');
      ctx.fillRect(sx, y, KEY_W, ROW_H);
    }
    for (let r = 0; r < rows; r++) {
      const pitch = PITCH_MAX - r;
      if (!BLACK.has(pitch % 12)) continue;
      const y = RULER_H + r * ROW_H;
      ctx.fillStyle = BLACK_KEY;
      ctx.fillRect(sx, y, BLACK_KEY_W, ROW_H - 1);
    }
    // 9px on every key, C included: the octave is marked by the brighter fill, not by bigger type.
    ctx.textBaseline = 'middle';
    ctx.font = `9px ${cssVar(el, '--font-mono')}`;
    ctx.fillStyle = cssVar(el, '--nc-page');
    for (let r = 0; r < rows; r++) {
      const pitch = PITCH_MAX - r;
      if (BLACK.has(pitch % 12)) continue;
      const y = RULER_H + r * ROW_H;
      ctx.fillText(midiToNoteName(pitch), sx + KEY_LABEL_X, y + ROW_H / 2);
    }
    // The corner where they meet belongs to neither.
    ctx.fillStyle = cssVar(el, '--nc-panel');
    ctx.fillRect(sx, sy, KEY_W, RULER_H);

    // Hover cell.
    const hv = this.hoverCell();
    if (hv && !this.drag) {
      ctx.strokeStyle = cssVar(el, '--nc-ink');
      ctx.strokeRect(
        KEY_W + hv.step * sw + 0.5,
        RULER_H + (PITCH_MAX - hv.pitch) * ROW_H + 0.5,
        sw - 1,
        ROW_H - 1,
      );
    }

    // Playhead.
    const ph = this.playhead();
    if (ph !== null) {
      const x = KEY_W + ph * sw;
      ctx.fillStyle = cssVar(el, '--nc-hot');
      ctx.fillRect(Math.floor(x), 0, 1, h);
      ctx.fillRect(Math.floor(x) - 9, this.scrollY() + 4, 18, RULER_H - 8);
      ctx.fillStyle = cssVar(el, '--nc-on-accent-dark');
      ctx.textAlign = 'center';
      ctx.fillText(String(Math.floor(ph) + 1), Math.floor(x), this.scrollY() + RULER_H / 2);
      ctx.textAlign = 'left';
    }
  }
}
