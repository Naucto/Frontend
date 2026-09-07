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
  template: `
    @if (allowNone()) {
      <button
        type="button"
        class="flex h-[22px] w-[22px] items-center justify-center rounded-xs border border-line-strong text-ink-4 outline-offset-2"
        [class]="value() === null ? 'outline-2 outline-ink' : ''"
        [attr.aria-label]="noneLabel()"
        [attr.aria-pressed]="value() === null"
        (click)="value.set(null)"
      >
        <nc-icon name="close" [size]="12" />
      </button>
    }
    @for (slot of slots(); track slot) {
      <button
        type="button"
        class="h-[22px] w-[22px] rounded-xs outline-offset-2"
        [class]="value() === slot ? 'outline-2 outline-ink' : ''"
        [style.background]="colours()[slot]"
        [attr.aria-label]="slotLabel() + ' ' + slot"
        [attr.aria-pressed]="value() === slot"
        (click)="value.set(slot)"
      ></button>
    }
  `,
  host: { class: 'flex flex-wrap items-center gap-0.75' },
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
