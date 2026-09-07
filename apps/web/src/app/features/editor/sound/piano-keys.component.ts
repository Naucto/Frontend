import { ChangeDetectionStrategy, Component, computed, output } from '@angular/core';
import { midiToNoteName } from '@naucto/engine';

import { KEY_W, PITCH_MAX, PITCH_MIN, ROW_H, RULER_H } from './piano-roll.component';

/** The black key, measured off the artboard: 34 of the 52-wide column. */
const BLACK_KEY_W = 34;
const BLACK = new Set([1, 3, 6, 8, 10]);

interface Key {
  pitch: number;
  name: string;
  black: boolean;
  /** Brighter for a C, which is how the octave is marked — not by larger type. */
  c: boolean;
}

/**
 * The keyboard beside the roll: a white bed with the black keys laid over it, as a keyboard is
 * built and as the artboard draws it.
 *
 * In the document rather than on the canvas, so the browser pins it while the roll scrolls under
 * it. Painted at the scroll offset it repainted a frame behind every scroll, which reads as a
 * keyboard sliding about — and a painted key can be neither hovered nor pressed.
 */
@Component({
  selector: 'nc-piano-keys',
  template: `
    <!-- The corner belongs to neither the keys nor the ruler, and holds its own place at the top. -->
    <div class="sticky top-0 z-10 shrink-0 bg-panel" [style.height.px]="RULER_H"></div>
    @for (k of keys(); track k.pitch) {
      <button
        type="button"
        class="relative block w-full shrink-0 cursor-pointer text-left"
        [style.height.px]="ROW_H"
        [class]="k.black ? 'bg-ink-body' : k.c ? 'bg-ink' : 'bg-ink-body'"
        [attr.aria-label]="k.name"
        (pointerdown)="pressed.emit(k.pitch)"
      >
        @if (k.black) {
          <span
            class="absolute top-0 left-0 block bg-[#17140f]"
            [style.width.px]="BLACK_KEY_W"
            [style.height.px]="ROW_H - 1"
          ></span>
        } @else {
          <span class="absolute top-1/2 left-[7px] -translate-y-1/2 font-mono text-[9px] text-page">
            {{ k.name }}
          </span>
        }
        <span class="absolute inset-0 hover:bg-gold/20 active:bg-gold/35"></span>
      </button>
    }
  `,
  host: { class: 'sticky left-0 z-10 flex shrink-0 flex-col bg-panel' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PianoKeysComponent {
  readonly pressed = output<number>();

  protected readonly ROW_H = ROW_H;
  protected readonly RULER_H = RULER_H;
  protected readonly BLACK_KEY_W = BLACK_KEY_W;
  protected readonly KEY_W = KEY_W;

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
