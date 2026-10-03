import { booleanAttribute, ChangeDetectionStrategy, Component, input, model } from '@angular/core';

import { IconComponent } from './icon.component';

/**
 * A slot is what gets stored, not the colour in it, so repainting the palette repaints everything
 * wearing it.
 *
 * The selection is an outline outside the swatch: an inset border would eat the very colour being
 * chosen.
 */
@Component({
  selector: 'nc-swatch-picker',
  imports: [IconComponent],
  templateUrl: './swatch-picker.component.html',
  host: { class: 'flex flex-wrap items-center gap-[5px]' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SwatchPickerComponent {
  readonly colours = input.required<readonly string[]>();
  readonly slots = input.required<readonly number[]>();
  readonly value = model<number | null>(null);
  readonly allowNone = input(false, { transform: booleanAttribute });
  readonly slotLabel = input('Palette slot');
  readonly noneLabel = input('No colour');
}
