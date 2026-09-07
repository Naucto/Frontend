import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';

/** Eight toggleable bits (sprite flags 0–7). Value is the byte. Cells are 30×26 per the design. */
@Component({
  selector: 'nc-bit-flags',
  template: `
    <div role="group" [attr.aria-label]="label()" class="flex gap-0.5">
      @for (bit of bits; track bit) {
        <button
          type="button"
          role="checkbox"
          [attr.aria-checked]="isSet(bit)"
          [attr.aria-label]="'Flag ' + bit"
          (click)="toggle(bit)"
          class="h-[26px] w-[30px] flex-none rounded-xs border border-line bg-raised font-mono text-label text-ink-3 hover:border-line-strong aria-checked:border-jade aria-checked:bg-jade aria-checked:text-on-accent"
        >
          {{ bit }}
        </button>
      }
    </div>
  `,
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BitFlagsComponent {
  readonly value = model(0);
  readonly label = input('Flags');
  protected readonly bits = [0, 1, 2, 3, 4, 5, 6, 7];
  protected isSet(bit: number): boolean {
    return (this.value() & (1 << bit)) !== 0;
  }
  protected toggle(bit: number): void {
    this.value.set(this.value() ^ (1 << bit));
  }
}
