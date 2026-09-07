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
import { ThemeService } from '@app/core/theme/theme.service';
import { cssVar } from '@app/shared/pixel/pixel-tools';
import { type Instrument, type Note, type Pattern, SUBSTEPS } from '@naucto/engine';
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

/**
 * Closest two grid lines may sit before they stop being a grid. Under it the ground between them is
 * thinner than the lines themselves and the lot reads as a filled band, which says the opposite of
 * what a grid is for.
 */
const MIN_GRID_PX = 6;
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
        <!-- Sized in device pixels and shown at CSS ones: this canvas is drawn, not sampled, so at
             any zoom but a whole one an upscaled backing store turns its ruler into mush. -->
        <canvas
          #canvas
          class="block cursor-crosshair touch-none"
          [width]="width() * dpr()"
          [height]="height() * dpr()"
          [style.width.px]="width()"
          [style.height.px]="height()"
          role="img"
          [attr.aria-label]="label()"
          (pointerdown)="onDown($event)"
          (pointermove)="onMove($event)"
          (pointerup)="onUp()"
          (pointercancel)="onUp()"
          (pointerleave)="onLeave()"
          (contextmenu)="$event.preventDefault()"
        ></canvas>
        @let head = playheadAt();
        @if (head !== null) {
          <!-- Out of the canvas so that moving it costs a style rather than a repaint of the whole
               roll, and so the flag can be pinned by the browser instead of redrawn at the scroll
               offset on every frame. -->
          <div
            class="pointer-events-none absolute top-0 bottom-0 w-px bg-hot"
            [style.left.px]="head.x"
            aria-hidden="true"
          >
            <div
              class="sticky top-[4px] -ml-[9px] flex h-[16px] w-[18px] items-center justify-center bg-hot font-mono text-[10px] text-on-accent-dark"
            >
              {{ head.step }}
            </div>
          </div>
        }
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
   * Note value the grid snaps to, as its denominator; 0 places notes freely. A resolution, not a
   * switch: the denominator decides the grain, so 1/8 and 1/16 are different grids rather than "on".
   */
  readonly snap = input<number>(16);
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

  /** Where the head sits and which step it is over, or null while nothing is playing. */
  protected readonly playheadAt = computed(() => {
    const ph = this.playhead();
    return ph === null ? null : { x: Math.floor(ph * this.stepW()), step: Math.floor(ph) + 1 };
  });
  /**
   * Device pixels per CSS pixel, followed rather than read once. It changes on a page zoom and on a
   * move to another screen, and a canvas that missed the change goes on drawing at the old
   * resolution until something unrelated happens to redraw it.
   */
  protected readonly dpr = signal(typeof window === 'undefined' ? 1 : window.devicePixelRatio);
  private readonly theme = inject(ThemeService);
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
  /** The whole placeable grid, widened to the window when the window is the roomier of the two. */
  protected readonly width = computed(() =>
    Math.max(MAX_STEPS * this.stepW(), this.hostBox().w - KEY_W),
  );
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
    // Re-armed after each change, because a resolution query only ever matches the ratio it was
    // built with.
    const watchDpr = (): void => {
      const m = window.matchMedia(`(resolution: ${String(window.devicePixelRatio)}dppx)`);
      m.addEventListener(
        'change',
        () => {
          this.dpr.set(window.devicePixelRatio);
          watchDpr();
        },
        { once: true },
      );
    };
    if (typeof window !== 'undefined') watchDpr();

    // Spelled out rather than left to `draw()`'s own reads, because the redraw is deferred to a
    // frame and would otherwise track nothing. Anything new that `draw()` reads has to be added
    // here too — a missing entry does not fail, it just stops repainting.
    effect(() => {
      this.pattern();
      this.hostBox();
      this.snap();
      this.theme.effective();
      this.instruments();
      this.palette();
      this.instrumentId();
      this.zoom();
      this.working();
      this.hoverCell();
      this.scrollX();
      this.scrollY();
      this.dpr();
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

  /** Where a note dropped at `step` would start, and how long it would come out. */
  private newNote(step: number): { step: number; length: number } {
    const unit = this.snapUnit();
    const length = unit || 1 / SUBSTEPS;
    // Floored, not rounded to the nearest line: a note starts in the cell you clicked, and at a
    // coarse grain the nearest line can be a whole bar away. Free placement has no cell to start
    // in, so there it follows the pointer onto the finest position that will sound.
    const start = unit ? Math.floor(step / unit) * unit : this.snapStep(step);
    return { step: Math.min(start, MAX_STEPS - length), length };
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
   * A beat is a quarter note, so a 1/`div` note lasts `4 / div` beats and a beat is `stepsPerBeat`
   * steps. At the default four steps per beat that puts 1/16 on one step, which is what a
   * sixteenth note is — the grain the labels have always named.
   *
   * The floor is what the sequencer can sound. Below it a note has a position nothing will ever
   * play from, which is worse than a coarser grid.
   */
  private snapUnit(): number {
    const div = this.snap();
    if (!div) return 0;
    return Math.max(1 / SUBSTEPS, (4 * this.pattern().stepsPerBeat) / div);
  }

  private snapStep(s: number): number {
    const unit = this.snapUnit();
    // Free still lands on the sub-step lattice: past it the sequencer has no tick to sound from.
    return unit ? Math.round(s / unit) * unit : Math.round(s * SUBSTEPS) / SUBSTEPS;
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
    const { step: start, length } = this.newNote(step);
    const note: Note = { step: start, pitch, length, instrument: inst, volume: 1 };
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
    const cell = { step: this.newNote(step).step, pitch };
    this.hoverCell.set(cell);
    this.hover.emit(cell);
    this.pointer.emit(this.pointOf(e));
    const d = this.drag;
    if (!d) return;
    const notes = [...this.notes()];
    const o = d.original;
    // The grid's ceiling, not the pattern's. Held to the pattern's, a note begun past its end has
    // no room to have any length, and a note of no length is one nothing can grab again.
    const max = MAX_STEPS;
    let n: Note;
    switch (d.mode) {
      case 'create':
      case 'resize': {
        const end = Math.max(
          o.step + (this.snapUnit() || 1 / SUBSTEPS),
          this.snapStep(step) + (this.snapUnit() || 1 / SUBSTEPS),
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
    ctx.setTransform(this.dpr(), 0, 0, this.dpr(), 0, 0);
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
    // Grid. Every vertical line stands for the snap grain — where the next note will land — so in
    // OFF there are none at all, bars included: a line there would mark a position with no more
    // claim on a note than the space beside it. The bars stay readable off the ruler above.
    ctx.strokeStyle = cssVar(el, '--nc-line');
    ctx.beginPath();
    const unit = this.snapUnit();
    if (unit * sw >= MIN_GRID_PX) {
      for (let s = unit; s < MAX_STEPS; s += unit) {
        if (s % p.stepsPerBeat === 0) continue;
        ctx.moveTo(s * sw + 0.5, RULER_H);
        ctx.lineTo(s * sw + 0.5, h);
      }
    }
    for (let r = 0; r <= rows; r++) {
      ctx.moveTo(0, RULER_H + r * ROW_H + 0.5);
      ctx.lineTo(w, RULER_H + r * ROW_H + 0.5);
    }
    ctx.stroke();
    if (unit) {
      ctx.strokeStyle = cssVar(el, '--nc-line-strong');
      ctx.beginPath();
      for (let s = 0; s <= MAX_STEPS; s += p.stepsPerBeat) {
        ctx.moveTo(s * sw + 0.5, 0);
        ctx.lineTo(s * sw + 0.5, h);
      }
      ctx.stroke();
    }

    // Past the last step a note may be placed on, the hatch a game with no cover wears — the app's
    // mark for ground that is not a surface. It exists only to fill a window wider than the grid;
    // the pattern's own end is not hatched, since a note placed after it lengthens the pattern.
    const endX = MAX_STEPS * sw;
    if (endX < w) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(endX, RULER_H, w - endX, h - RULER_H);
      ctx.clip();
      ctx.fillStyle = cssVar(el, '--nc-page');
      ctx.fillRect(endX, RULER_H, w - endX, h - RULER_H);
      ctx.strokeStyle = cssVar(el, '--nc-line');
      ctx.lineWidth = 6;
      ctx.beginPath();
      for (let x = endX - h; x < w + h; x += 12) {
        ctx.moveTo(x, h);
        ctx.lineTo(x + h, 0);
      }
      ctx.stroke();
      ctx.restore();
      ctx.lineWidth = 1;
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
    for (let s = 0; s < MAX_STEPS; s += p.stepsPerBeat)
      ctx.fillText(String(s / p.stepsPerBeat + 1), s * sw + 4, sy + RULER_H / 2);

    // Hover cell.
    const hv = this.hoverCell();
    if (hv && !this.drag) {
      ctx.strokeStyle = cssVar(el, '--nc-ink');
      ctx.strokeRect(
        hv.step * sw + 0.5,
        RULER_H + (PITCH_MAX - hv.pitch) * ROW_H + 0.5,
        (this.snapUnit() || 1 / SUBSTEPS) * sw - 1,
        ROW_H - 1,
      );
    }
  }
}
