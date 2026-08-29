import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { type Instrument, SFX_SLOTS } from '@naucto/engine';
import { ButtonDirective, HelpDotComponent, IconComponent } from '@naucto/ui';

import { WaveGlyphComponent } from './wave-glyph.component';

/** Left column of the SOUND tab: the instruments and the 16 sfx slots. */
@Component({
  selector: 'nc-instrument-list',
  imports: [
    TranslocoDirective,
    ButtonDirective,
    IconComponent,
    HelpDotComponent,
    WaveGlyphComponent,
  ],
  template: `
    <div *transloco="let t" class="flex h-full flex-col">
      <div class="flex h-5 items-center border-b border-line px-1.5">
        <span class="label text-ink-3">{{ t('editor.sound.instruments') }}</span>
        <span class="flex-1"></span>
        <button
          ncButton
          variant="ghost"
          size="sm"
          iconOnly
          [attr.aria-label]="t('editor.sound.addInstrument')"
          (click)="add.emit()"
        >
          <nc-icon name="plus" [size]="12" />
        </button>
      </div>
      <div
        class="min-h-0 flex-1 overflow-auto"
        role="listbox"
        [attr.aria-label]="t('editor.sound.instruments')"
      >
        @for (i of list(); track i.id) {
          <div
            role="option"
            tabindex="0"
            [attr.aria-selected]="i.id === selectedId()"
            class="group flex cursor-pointer items-center gap-[11px] border-l-[3px] border-transparent px-[14px] py-[9px] hover:bg-raised aria-selected:border-gold aria-selected:bg-raised"
            [style.color]="palette()[i.colour]"
            (click)="selected.emit(i.id)"
            (keydown.enter)="selected.emit(i.id)"
          >
            <nc-wave-glyph [type]="i.osc" />
            <div class="min-w-0 flex-1">
              <div class="truncate text-body text-ink">{{ i.name }}</div>
              <div class="label text-ink-3">{{ meta(i) }}</div>
            </div>
            <button
              ncButton
              variant="ghost"
              size="sm"
              iconOnly
              class="opacity-0 group-hover:opacity-100"
              [attr.aria-label]="t('editor.sound.removeInstrument', { name: i.name })"
              (click)="$event.stopPropagation(); remove.emit(i.id)"
            >
              <nc-icon name="trash" [size]="12" />
            </button>
          </div>
        }
      </div>
      <div class="border-t border-line p-1.5">
        <div class="mb-1 flex items-center gap-1">
          <span class="label text-ink-3">{{ t('editor.sound.sfxSlots') }}</span>
          <span class="flex-1"></span>
          <span class="label text-ink-4">{{ sfx().size }} / {{ slots.length }}</span>
          <nc-help-dot [text]="t('editor.sound.sfxHelp')" />
        </div>
        <div
          class="grid grid-cols-4 gap-0.5"
          role="group"
          [attr.aria-label]="t('editor.sound.sfxSlots')"
        >
          @for (s of slots; track s) {
            <button
              type="button"
              class="h-[22px] rounded-xs border font-mono text-label"
              [class]="slotClass(s)"
              [attr.aria-pressed]="sfx().get(String(s)) === patternId()"
              [attr.aria-label]="t('editor.sound.sfxSlot', { n: s })"
              (click)="sfxToggle.emit(s)"
            >
              {{ pad(s) }}
            </button>
          }
        </div>
      </div>
    </div>
  `,
  host: { class: 'block h-full' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InstrumentListComponent {
  readonly list = input.required<Instrument[]>();
  readonly selectedId = input<string | null>(null);
  readonly palette = input.required<readonly string[]>();
  readonly sfx = input.required<Map<string, string>>();
  readonly patternId = input<string | null>(null);
  readonly selected = output<string>();
  readonly add = output();
  readonly remove = output<string>();
  readonly sfxToggle = output<number>();
  protected readonly slots = Array.from({ length: SFX_SLOTS }, (_, i) => i);
  protected readonly String = String;

  protected pad(n: number): string {
    return String(n).padStart(2, '0');
  }

  protected meta(i: Instrument): string {
    const parts = [
      i.osc === 'sample' ? 'PCM' : i.osc === 'triangle' ? 'TRIANGLE' : i.osc.toUpperCase(),
    ];
    if (i.osc === 'square') parts.push(`${String(Math.round(i.duty * 100))}%`);
    if (i.filter.type !== 'off') parts.push(`${i.filter.type.toUpperCase()}F`);
    return parts.join(' · ');
  }

  protected slotClass(s: number): string {
    const pid = this.sfx().get(String(s));
    // An assigned slot is a *fill*, and the one holding the pattern you are editing inverts —
    // an outline alone does not read as "this slot has something in it" across sixteen cells.
    if (!pid) return 'border-line bg-inset text-ink-4 hover:text-ink hover:border-line-strong';
    return pid === this.patternId()
      ? 'border-gold bg-gold text-on-accent'
      : 'border-line-strong bg-raised text-ink-body';
  }
}
