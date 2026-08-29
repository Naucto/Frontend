import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';

/** The 16 swatches of a game palette, 8 per row; one is selected. */
@Component({
  selector: 'nc-palette-grid',
  template: `
    <div role="radiogroup" [attr.aria-label]="label()" class="grid grid-cols-8 gap-0.5">
      @for (hex of colours(); track $index) {
        <button
          type="button"
          role="radio"
          [attr.aria-checked]="$index === value()"
          [attr.aria-label]="'Colour ' + $index + ' ' + hex"
          [style.background]="hex"
          (click)="value.set($index)"
          class="aspect-[5/3] cursor-pointer rounded-xs outline-offset-1 transition-[outline-color] duration-100 aria-checked:outline-2 aria-checked:outline-gold"
        ></button>
      }
    </div>
  `,
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaletteGridComponent {
  readonly colours = input.required<readonly string[]>();
  readonly value = model(0);
  readonly label = input('Palette');
}
