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

import { PITCH_MAX, PITCH_MIN, ROW_H, RULER_H } from './piano-roll.component';

/** Measured off the artboard; the white bed shows to its right. */
const BLACK_KEY_W = 34;
const BLACK = new Set([1, 3, 6, 8, 10]);

interface Key {
  pitch: number;
  name: string;
  black: boolean;
  /** A C, which the keyboard marks with a brighter key rather than with a label of its own. */
  c: boolean;
}

/** Raised on hover, sunk while held: the one shaded control in the app, with hard edges because a
 * screen of whole pixels has no gradient. */
const KEY_UP =
  'absolute inset-0 hover:bg-gold/15 hover:shadow-[inset_0_1px_0_var(--color-key-lit),inset_0_-2px_0_var(--color-key-sharp)]';
const KEY_DOWN =
  'absolute inset-0 bg-gold/30 shadow-[inset_0_2px_0_var(--color-key-sharp),inset_0_-1px_0_var(--color-key-lit)]';

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
  protected readonly KEY_UP = KEY_UP;
  protected readonly KEY_DOWN = KEY_DOWN;
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  /** The key under the pointer while it is down; nothing between presses. */
  protected readonly held = signal<number | null>(null);

  protected onDown(e: PointerEvent, pitch: number): void {
    if (e.button !== 0) return;
    this.host.nativeElement.setPointerCapture(e.pointerId);
    this.held.set(pitch);
    this.pressed.emit(pitch);
  }

  protected onMove(e: PointerEvent): void {
    const was = this.held();
    if (was === null) return;
    const key = document
      .elementFromPoint(e.clientX, e.clientY)
      ?.closest<HTMLElement>('[data-pitch]');
    const pitch = key ? Number(key.dataset.pitch) : null;
    if (pitch === null || pitch === was) return;
    this.released.emit();
    this.held.set(pitch);
    this.pressed.emit(pitch);
  }

  protected onUp(): void {
    if (this.held() === null) return;
    this.held.set(null);
    this.released.emit();
  }

  protected readonly keys = computed<Key[]>(() =>
    Array.from({ length: PITCH_MAX - PITCH_MIN + 1 }, (_, r) => {
      const pitch = PITCH_MAX - r;
      return {
        pitch,
        name: midiToNoteName(pitch),
        black: BLACK.has(pitch % 12),
        c: pitch % 12 === 0,
      };
    }),
  );
}
