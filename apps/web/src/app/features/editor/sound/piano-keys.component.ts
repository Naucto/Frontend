import { ChangeDetectionStrategy, Component, computed, output } from '@angular/core';
import { midiToNoteName } from '@naucto/engine';

import { KEY_W, PITCH_MAX, PITCH_MIN, ROW_H, RULER_H } from './piano-roll.component';

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

/**
 * The keyboard beside the roll: a white bed with the black keys laid over it.
 *
 * In the document rather than drawn, for two things a drawing cannot do — hold still while what is
 * beside it scrolls, without being repainted to keep up, and answer a pointer.
 */
@Component({
  selector: 'nc-piano-keys',
  template: `
    <!-- The corner belongs to neither the keys nor the ruler, and holds its own place at the top. -->
    <div class="sticky top-0 z-10 shrink-0 bg-panel" [style.height.px]="RULER_H"></div>
    @for (k of keys(); track k.pitch) {
      <button
        type="button"
        class="relative block w-full shrink-0 cursor-pointer border-b border-b-key-sharp text-left"
        [style.height.px]="ROW_H"
        [class]="k.c ? 'bg-key-lit' : 'bg-key'"
        [attr.aria-label]="k.name"
        (pointerdown)="pressed.emit(k.pitch)"
      >
        @if (k.black) {
          <span
            class="absolute top-0 left-0 block bg-key-sharp"
            [style.width.px]="BLACK_KEY_W"
            [style.height.px]="ROW_H - 1"
          ></span>
        } @else {
          <span
            class="absolute top-1/2 left-[7px] -translate-y-1/2 font-mono text-[9px] text-key-sharp"
          >
            {{ k.name }}
          </span>
        }
        <!--
          The one shaded control the design allows, and it is here because a key is the one thing in
          the app that stands for something you physically push. Hover raises it — lit along the top
          edge, shadowed under the bottom one; pressing swaps the two and it sinks. That is the whole
          of the feedback: a key that only changes colour reads as a swatch.

          Both edges are hard, with no blur radius. Everything else that casts a shadow here does the
          same — two pixels down on the tooltip and the toast, four on the popover — since a gradient
          is the one thing a screen made of whole pixels cannot draw.
        -->
        <span
          class="absolute inset-0 hover:bg-gold/15 hover:shadow-[inset_0_1px_0_var(--color-key-lit),inset_0_-2px_0_var(--color-key-sharp)] active:bg-gold/30 active:shadow-[inset_0_2px_0_var(--color-key-sharp),inset_0_-1px_0_var(--color-key-lit)]"
        ></span>
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
