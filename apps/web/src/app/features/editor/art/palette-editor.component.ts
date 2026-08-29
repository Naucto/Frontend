import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { hexToRgb } from '@naucto/engine';
import { SliderComponent } from '@naucto/ui';

/** Edits one palette slot: hex field plus R/G/B sliders. */
@Component({
  selector: 'nc-palette-editor',
  imports: [SliderComponent],
  template: `
    <div class="rounded-sm border border-line bg-panel p-1.5">
      <div class="flex items-center gap-1">
        <span
          class="h-[26px] w-[26px] rounded-xs border border-line-strong"
          [style.background]="hex()"
        ></span>
        <span class="font-mono text-meta text-ink">{{ slotLabel() }} {{ pad(slot()) }}</span>
        <input
          type="text"
          [value]="hex().toUpperCase()"
          [attr.aria-label]="hexLabel()"
          maxlength="7"
          spellcheck="false"
          (change)="onHex($event)"
          class="ml-auto min-w-0 flex-1 rounded-xs border border-line-strong bg-inset px-1 py-0.5 text-right font-mono text-meta text-ink outline-none focus:border-gold"
        />
      </div>
      <div class="mt-1 grid gap-0.5">
        <nc-slider
          label="R"
          [max]="255"
          [value]="rgb()[0]"
          [readout]="String(rgb()[0])"
          accent="hot"
          compact
          (valueChange)="onChannel(0, $event)"
        />
        <nc-slider
          label="G"
          [max]="255"
          [value]="rgb()[1]"
          [readout]="String(rgb()[1])"
          accent="jade"
          compact
          (valueChange)="onChannel(1, $event)"
        />
        <nc-slider
          label="B"
          [max]="255"
          [value]="rgb()[2]"
          [readout]="String(rgb()[2])"
          accent="sky"
          compact
          (valueChange)="onChannel(2, $event)"
        />
      </div>
    </div>
  `,
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaletteEditorComponent {
  readonly colours = input.required<readonly string[]>();
  readonly slot = input(0);
  readonly slotLabel = input('Slot');
  readonly hexLabel = input('Hex colour');
  readonly colourChange = output<{ slot: number; hex: string }>();
  protected readonly String = String;
  protected readonly hex = computed(() => this.colours()[this.slot()] ?? '#000000');
  protected readonly rgb = computed(() => hexToRgb(this.hex()));

  protected pad(n: number): string {
    return String(n).padStart(2, '0');
  }

  protected onHex(e: Event): void {
    const raw = (e.target as HTMLInputElement).value.trim().replace(/^#/, '');
    if (!/^[0-9a-fA-F]{6}$/.test(raw)) {
      (e.target as HTMLInputElement).value = this.hex().toUpperCase();
      return;
    }
    this.colourChange.emit({ slot: this.slot(), hex: `#${raw.toLowerCase()}` });
  }

  protected onChannel(i: number, v: number): void {
    const rgb = [...this.rgb()];
    rgb[i] = Math.max(0, Math.min(255, Math.round(v)));
    const hex = `#${rgb.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
    this.colourChange.emit({ slot: this.slot(), hex });
  }
}
