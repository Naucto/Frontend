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
import { type Instrument, type Note, type Pattern } from '@naucto/engine';
import { PresenceLayerComponent, type PresenceMark, type PresenceViewport } from '@naucto/ui';

import { type Collaborator } from '../work-session/work-session.service';
import { PianoKeysComponent } from './piano-keys.component';

export const PITCH_MIN = 24;
export const PITCH_MAX = 95;
// Measured off the artboard: a 20px row is tall enough to grab a note by its edge, and 52px of
// key column fits "C#4" without crowding the grid.
export const ROW_H = 20;
export const KEY_W = 52;
export const RULER_H = 24;
/**
 * The longest a pattern may be.
 *
 * The grid is always this wide, whatever the pattern currently holds: a note has to be placed
 * somewhere before the pattern can be asked to reach it, and a grid that stopped at the last step
 * left nowhere to place it.
 */
export const MAX_STEPS = 64;
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
  imports: [PianoKeysComponent, PresenceLayerComponent],
  template: `
    <div class="flex" [style.width.px]="width()" [style.height.px]="height()">
      <nc-piano-keys [style.width.px]="KEY_W" (pressed)="playKey($event)" />
      <div class="relative">
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
        <nc-presence-layer [marks]="marks()" [viewport]="viewPx()" />
      </div>
    </div>
  `,
  host: { class: 'block overflow-auto', tabindex: '0' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PianoRollComponent {
  protected readonly KEY_W = KEY_W;
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
  /**
   * Where the pointer actually is, in fractional steps and pitches.
   *
   * `hover` is snapped to a whole cell because that is the note you are about to place. A cursor
   * shown to somebody else wants the opposite: snapped, a peer's cursor crosses the roll in
   * row-high jumps instead of moving.
   */
  readonly pointer = output<{ x: number; y: number } | null>();

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly working = signal<Note[] | null>(null);
  private readonly hoverCell = signal<{ step: number; pitch: number } | null>(null);
  private drag: Drag | null = null;
  private raf = 0;

  private readonly hostBox = signal({ w: 0, h: 0 });
  /** Scroll offsets, so the ruler and the key column can be redrawn where they stay in view. */
  private readonly scrollX = signal(0);
  private readonly scrollY = signal(0);
  /**
   * A step is 24px wide at ×1, whatever the pattern's length, and zoom multiplies that.
   *
   * The width used to stretch to fill the roll, which made every pattern look the same size: a
   * sixteen-step sketch filled the screen with four enormous bars and read as a finished piece,
   * while zoom was left doing the job of getting back OUT to see it whole. At a fixed scale the
   * roll says how long the pattern actually is — four bars occupy four bars' worth — and zoom is
   * only ever for going closer.
   */
  readonly stepW = computed(() => 24 * this.zoom());
  protected readonly width = computed(() => MAX_STEPS * this.stepW());
  protected readonly height = computed(() => RULER_H + (PITCH_MAX - PITCH_MIN + 1) * ROW_H);
  protected readonly marks = computed<PresenceMark[]>(() =>
    this.collaborators()
      .filter((c) => !c.isSelf && c.cursor?.tab === 'sound')
      .map((c) => ({
        id: c.clientId,
        name: c.name,
        colour: c.colour,
        x: (c.cursor?.x ?? 0) * this.stepW(),
        y: RULER_H + (PITCH_MAX - (c.cursor?.y ?? 0)) * ROW_H,
      })),
  );
  /**
   * What is on screen, in the drawn pixels the marks are placed in. The roll is taller than any
   * panel that holds it, so somebody an octave away is off the frame far more often than not.
   */
  protected readonly viewPx = computed<PresenceViewport>(() => ({
    x: this.scrollX(),
    y: this.scrollY(),
    w: this.hostBox().w,
    h: this.hostBox().h,
  }));

  constructor() {
    const onScroll = (): void => {
      const el = this.host.nativeElement;
      this.scrollX.set(el.scrollLeft);
      this.scrollY.set(el.scrollTop);
    };
    this.host.nativeElement.addEventListener('scroll', onScroll, { passive: true });
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) this.hostBox.set({ w: r.width, h: r.height });
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

  private cellOf(e: PointerEvent): { step: number; pitch: number } {
    const r = this.canvas().nativeElement.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const step = Math.max(0, x / this.stepW());
    const pitch = Math.max(
      PITCH_MIN,
      Math.min(PITCH_MAX, PITCH_MAX - Math.floor((y - RULER_H) / ROW_H)),
    );
    return { step, pitch };
  }

  /** The same position as `cellOf`, unsnapped on both axes. */
  private pointOf(e: PointerEvent): { x: number; y: number } {
    const r = this.canvas().nativeElement.getBoundingClientRect();
    return {
      x: Math.max(0, (e.clientX - r.left) / this.stepW()),
      y: PITCH_MAX - (e.clientY - r.top - RULER_H) / ROW_H,
    };
  }

  /**
   * One snap unit in steps, given the pattern's own steps-per-beat.
   *
   * The floor is an eighth of a step, which is what the finest division the control offers works
   * out to on a pattern of four steps to the beat. A coarser floor would silently round that
   * division back onto the one above it, leaving two settings that do the same thing.
   */
  private snapUnit(): number {
    const div = this.snap();
    if (!div) return 0;
    return Math.max(0.125, this.pattern().stepsPerBeat / div);
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

  protected playKey(pitch: number): void {
    const inst = this.instrumentId();
    if (inst) this.audition.emit({ instrument: inst, pitch });
  }

  protected onDown(e: PointerEvent): void {
    const { step, pitch } = this.cellOf(e);
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
    const unit = this.snapUnit() || 0.25;
    const start = Math.min(this.snapStep(step), MAX_STEPS - unit);
    const note: Note = { step: start, pitch, length: unit, instrument: inst, volume: 1 };
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
    const { step, pitch } = this.cellOf(e);
    const cell = { step: Math.floor(step), pitch };
    this.hoverCell.set(cell);
    this.hover.emit(cell);
    this.pointer.emit(this.pointOf(e));
    const d = this.drag;
    if (!d) return;
    const notes = [...this.notes()];
    const o = d.original;
    // The grid's ceiling, not the pattern's current length: a note dropped past the end is what
    // asks the pattern to grow, and holding it to the length that is makes that impossible — it
    // came out with no length at all, which is a note nothing can grab again.
    const max = MAX_STEPS;
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
    this.pointer.emit(null);
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
        ctx.fillRect(0, y, w, ROW_H);
      }
    }
    // Grid.
    ctx.strokeStyle = cssVar(el, '--nc-line');
    ctx.beginPath();
    for (let s = 0; s <= p.steps; s++) {
      if (s % p.stepsPerBeat === 0) continue;
      ctx.moveTo(s * sw + 0.5, RULER_H);
      ctx.lineTo(s * sw + 0.5, h);
    }
    for (let r = 0; r <= rows; r++) {
      ctx.moveTo(0, RULER_H + r * ROW_H + 0.5);
      ctx.lineTo(w, RULER_H + r * ROW_H + 0.5);
    }
    ctx.stroke();
    ctx.strokeStyle = cssVar(el, '--nc-line-strong');
    ctx.beginPath();
    for (let s = 0; s <= p.steps; s += p.stepsPerBeat) {
      ctx.moveTo(s * sw + 0.5, 0);
      ctx.lineTo(s * sw + 0.5, h);
    }
    ctx.stroke();

    // Past the pattern's last step the grid is still there to be drawn on, dimmed so the end of
    // what the pattern currently holds stays legible, and closed by a rule.
    const endX = p.steps * sw;
    if (endX < w) {
      ctx.fillStyle = cssVar(el, '--nc-page');
      ctx.globalAlpha = 0.55;
      ctx.fillRect(endX, RULER_H, w - endX, h - RULER_H);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = cssVar(el, '--nc-line-strong');
      ctx.beginPath();
      ctx.moveTo(endX + 0.5, RULER_H);
      ctx.lineTo(endX + 0.5, h);
      ctx.stroke();
    }

    // Notes.
    const pal = this.palette();
    const insts = this.instruments();
    const selected = this.instrumentId();
    for (const n of this.notes()) {
      const inst = insts.get(n.instrument);
      const colour = pal[inst?.colour ?? 4] ?? '#fff';
      const x = n.step * sw;
      const y = RULER_H + (PITCH_MAX - n.pitch) * ROW_H;
      ctx.globalAlpha = selected && n.instrument !== selected ? 0.55 : 1;
      ctx.fillStyle = colour;
      ctx.fillRect(x + 1, y + 1, Math.max(3, n.length * sw - 2), ROW_H - 2);
      ctx.globalAlpha = 1;
    }

    // Ruler and key column are drawn at the current scroll offset, so they stay pinned while the
    // grid scrolls under them — the same effect as position:sticky, on one canvas.
    const sy = this.scrollY();
    ctx.fillStyle = cssVar(el, '--nc-panel');
    ctx.fillRect(0, sy, w, RULER_H);
    ctx.font = `10px ${cssVar(el, '--font-mono')}`;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = cssVar(el, '--nc-ink-4');
    for (let s = 0; s < p.steps; s += p.stepsPerBeat)
      ctx.fillText(String(s / p.stepsPerBeat + 1), s * sw + 4, sy + RULER_H / 2);

    // The end, named on the ruler. The wash below says where the pattern stops, but not what it
    // stops at, and the only other statement of that is a field at the top of the screen.
    const end = p.steps * sw;
    if (end < w) {
      const text = `${String(p.steps)} STEPS`;
      const chipW = ctx.measureText(text).width + 10;
      ctx.fillStyle = cssVar(el, '--nc-line-strong');
      ctx.fillRect(end - chipW, sy, chipW, RULER_H);
      ctx.fillStyle = cssVar(el, '--nc-ink-2');
      ctx.fillText(text, end - chipW + 5, sy + RULER_H / 2);
    }

    // Hover cell.
    const hv = this.hoverCell();
    if (hv && !this.drag) {
      ctx.strokeStyle = cssVar(el, '--nc-ink');
      ctx.strokeRect(
        hv.step * sw + 0.5,
        RULER_H + (PITCH_MAX - hv.pitch) * ROW_H + 0.5,
        sw - 1,
        ROW_H - 1,
      );
    }

    // Playhead.
    const ph = this.playhead();
    if (ph !== null) {
      const x = ph * sw;
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
