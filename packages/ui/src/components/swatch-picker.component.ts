import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  model,
  signal,
} from '@angular/core';

import { inkFor } from '../palette';
import { MarkComponent } from './mark.component';
import { mark } from './selection-styles';

interface SwatchCell {
  /** `null` is the cell that stands for no colour. */
  slot: number | null;
  colour: string | null;
  ink: string | null;
  frame: string;
  /** A cell of the top row has no skirt to sink into, so it gives up a pixel of its own height. */
  sinks: boolean;
}

const SIDES = 'relative bevel-edge-line-strong focus-visible:z-10 data-on:bevel-lit';

/**
 * A slot is what gets stored, not the colour in it, so repainting the palette repaints everything
 * wearing it.
 *
 * The swatches are one joined block, framed only along its outside. The selection is a mark in the
 * middle of the swatch, in whichever ink reads on it, and the pressed edge of a cell on the rim.
 */
@Component({
  selector: 'nc-swatch-picker',
  imports: [MarkComponent],
  templateUrl: './swatch-picker.component.html',
  host: {
    class: 'inline-grid justify-start',
    '[style.grid-template-columns]': 'columnTrack()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SwatchPickerComponent {
  readonly colours = input.required<readonly string[]>();
  readonly slots = input.required<readonly number[]>();
  readonly value = model<number | null>(null);
  readonly allowNone = input(false, { transform: booleanAttribute });
  readonly slotLabel = input('Palette slot');
  readonly noneLabel = input('No colour');
  /** Swatches to a row. */
  readonly columns = input(8);

  /** What was selected before the last pick; `undefined` until something is picked. */
  private readonly previous = signal<number | null | undefined>(undefined);

  protected readonly columnTrack = computed(() => `repeat(${String(this.columns())}, auto)`);

  protected readonly cells = computed<SwatchCell[]>(() => {
    const slots: (number | null)[] = this.allowNone() ? [null, ...this.slots()] : [...this.slots()];
    const columns = this.columns();
    return slots.map((slot, i) => {
      const top = i < columns;
      const bottom = i + columns >= slots.length;
      const left = i % columns === 0;
      const right = i % columns === columns - 1 || i === slots.length - 1;
      const colour = slot === null ? null : (this.colours()[slot] ?? null);
      return {
        slot,
        colour,
        ink: colour === null ? null : inkFor(colour),
        frame: [
          SIDES,
          bottom ? 'raised-sm data-on:bevel-down' : 'flat-sm bevel-open-b',
          top ? '' : 'bevel-open-t',
          left ? '' : 'bevel-open-l',
          right ? '' : 'bevel-open-r',
          slot === null ? 'bevel-fill-inset' : '',
        ].join(' '),
        sinks: top && !bottom,
      };
    });
  });

  protected markClass(slot: number | null): string {
    const picked = this.previous() !== undefined;
    return slot === this.value() ? mark(true, picked) : mark(false, slot === this.previous());
  }

  protected pick(slot: number | null): void {
    if (slot !== this.value()) {
      this.previous.set(this.value());
      this.value.set(slot);
    }
  }
}
