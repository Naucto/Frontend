import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { hexToRgb } from '@naucto/engine';
import { SliderComponent } from '@naucto/ui';

/** Edits one palette slot: hex field plus R/G/B sliders. */
@Component({
  selector: 'nc-palette-editor',
  imports: [SliderComponent],
  templateUrl: './palette-editor.component.html',
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
  protected readonly digits = computed(() => this.hex().slice(1).toUpperCase());

  protected pad(n: number): string {
    return String(n).padStart(2, '0');
  }

  protected onHex(e: Event): void {
    const raw = (e.target as HTMLInputElement).value.trim().replace(/^#/, '');
    if (!/^[0-9a-fA-F]{6}$/.test(raw)) {
      (e.target as HTMLInputElement).value = this.digits();
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
