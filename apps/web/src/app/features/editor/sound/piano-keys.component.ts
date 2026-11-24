import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  output,
  signal,
} from '@angular/core';
import { midiToNoteName } from '@naucto/engine';

import { PITCH_MAX, PITCH_MIN, ROW_H, RULER_H } from './piano-geometry';

/** Measured off the artboard; the white bed shows to its right. */
const BLACK_KEY_W = 34;
const BLACK = new Set([1, 3, 6, 8, 10]);

interface Key {
  pitch: number;
  name: string;
  black: boolean;
  /** A C, which the keyboard marks with a brighter key rather than with a label of its own. */
  c: boolean;
  top: number;
  height: number;
}

const ROWS = PITCH_MAX - PITCH_MIN + 1;
const LOWER_WHITES = [0, 2, 4];
const UPPER_WHITES = [5, 7, 9, 11];

function whiteSpan(degree: number): { from: number; rows: number } {
  const lower = LOWER_WHITES.indexOf(degree);
  if (lower >= 0) {
    return { from: (lower * 5) / 3, rows: 5 / 3 };
  }
  return { from: 5 + (UPPER_WHITES.indexOf(degree) * 7) / 4, rows: 7 / 4 };
}

/**
 * The keyboard beside the roll: a white bed with the black keys laid over it.
 *
 * In the document rather than drawn, for two things a drawing cannot do — hold still while what is
 * beside it scrolls, without being repainted to keep up, and answer a pointer.
 *
 * A press is a glissando as much as a note: the pointer is captured by the keyboard rather than
 * by the key it landed on, so a drag across the keys lets each one go and sounds the next as it
 * is crossed. Which key is down is state, not `:active`, for the same reason — capture pins the
 * browser's own hover and active states to the key that was pressed first.
 */
@Component({
  selector: 'nc-piano-keys',
  templateUrl: './piano-keys.component.html',
  host: {
    class: 'sticky left-0 z-10 flex shrink-0 touch-none flex-col bg-panel',
    '(pointermove)': 'onMove($event)',
    '(pointerup)': 'onUp()',
    '(pointercancel)': 'onUp()',
    '(lostpointercapture)': 'onUp()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PianoKeysComponent {
  readonly pressed = output<number>();
  /** The key was let go. The note it started sounds until this arrives. */
  readonly released = output();

  protected readonly ROW_H = ROW_H;
  protected readonly RULER_H = RULER_H;
  protected readonly BLACK_KEY_W = BLACK_KEY_W;
  protected readonly BED_H = ROWS * ROW_H;
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  /** The key under the pointer while it is down; nothing between presses. */
  protected readonly held = signal<number | null>(null);

  protected onDown(event: PointerEvent, pitch: number): void {
    if (event.button !== 0) {
      return;
    }
    this.host.nativeElement.setPointerCapture(event.pointerId);
    this.held.set(pitch);
    this.pressed.emit(pitch);
  }

  protected onMove(event: PointerEvent): void {
    const was = this.held();
    if (was === null) {
      return;
    }
    const key = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>('[data-pitch]');
    const pitch = key ? Number(key.dataset.pitch) : null;
    if (pitch === null || pitch === was) {
      return;
    }
    this.released.emit();
    this.held.set(pitch);
    this.pressed.emit(pitch);
  }

  protected onUp(): void {
    if (this.held() === null) {
      return;
    }
    this.held.set(null);
    this.released.emit();
  }

  protected readonly keys = computed<Key[]>(() => {
    const out: Key[] = [];
    for (let pitch = PITCH_MIN; pitch <= PITCH_MAX; pitch++) {
      const degree = pitch % 12;
      const black = BLACK.has(degree);
      const rowTop = (PITCH_MAX - pitch) * ROW_H;
      let top = rowTop;
      let height = ROW_H;
      if (!black) {
        const octaveBottom = (PITCH_MAX - (pitch - degree)) * ROW_H + ROW_H;
        const span = whiteSpan(degree);
        top = octaveBottom - (span.from + span.rows) * ROW_H;
        height = span.rows * ROW_H;
      }
      out.push({ pitch, name: midiToNoteName(pitch), black, c: degree === 0, top, height });
    }
    return out.sort((a, b) => Number(a.black) - Number(b.black));
  });
}
