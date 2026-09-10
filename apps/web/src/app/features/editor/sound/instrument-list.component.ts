import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { type Instrument } from '@naucto/engine';
import {
  ButtonDirective,
  HelpDotComponent,
  IconComponent,
  type SlotCell,
  SlotGridComponent,
  slotRange,
  TooltipDirective,
} from '@naucto/ui';

import { WaveGlyphComponent } from './wave-glyph.component';

/** How wide the bank is drawn, in cells. */
const COLUMNS = 4;

/** Left column of the SOUND tab: the instruments and the bank of sound effects. */
@Component({
  selector: 'nc-instrument-list',
  imports: [
    TranslocoDirective,
    ButtonDirective,
    IconComponent,
    HelpDotComponent,
    TooltipDirective,
    SlotGridComponent,
    WaveGlyphComponent,
  ],
  template: `
    <div *transloco="let t" class="flex h-full flex-col">
      <div class="flex h-(--nc-bar-h) items-center border-b border-line px-1.5">
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
          <nc-icon name="plus" [size]="24" />
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
            <!-- The wave keeps the row's accent colour, which is the instrument's own: it is the
                 one thing in the list that says what the name sounds like. -->
            <nc-wave-glyph [type]="i.osc" />
            <div class="min-w-0 flex-1 truncate text-body text-ink">{{ i.name }}</div>
            <button
              ncButton
              variant="ghost"
              size="sm"
              iconOnly
              class="opacity-0 group-hover:opacity-100"
              [attr.aria-label]="t('editor.sound.duplicate')"
              [ncTooltip]="t('editor.sound.duplicate')"
              (click)="$event.stopPropagation(); duplicate.emit(i.id)"
            >
              <nc-icon name="copy" [size]="12" />
            </button>
            <button
              ncButton
              variant="ghost"
              size="sm"
              iconOnly
              class="opacity-0 group-hover:opacity-100"
              [attr.aria-label]="t('editor.sound.editInstrument')"
              [ncTooltip]="t('editor.sound.editInstrument')"
              (click)="$event.stopPropagation(); edit.emit(i.id)"
            >
              <nc-icon name="edit" [size]="12" />
            </button>
            <button
              ncButton
              variant="ghost"
              size="sm"
              iconOnly
              class="opacity-0 group-hover:opacity-100"
              [attr.aria-label]="t('editor.sound.removeInstrument', { name: i.name })"
              [ncTooltip]="t('editor.sound.removeInstrument', { name: i.name })"
              (click)="$event.stopPropagation(); remove.emit(i.id)"
            >
              <nc-icon name="trash" [size]="12" />
            </button>
          </div>
        }
      </div>
      <!-- Never squeezed: the bank stands five rows tall, and it is the list of instruments above
           it that gives up the room on a short screen. -->
      <div class="shrink-0 border-t border-line p-1.5">
        <div class="mb-1 flex items-center gap-1">
          <span class="label text-ink-3">{{ t('editor.sound.sfxSlots') }}</span>
          <span class="flex-1"></span>
          <nc-help-dot [text]="t('editor.sound.sfxHelp')" />
        </div>
        <!-- Five rows tall whatever it holds, and it scrolls: the bank has no last slot, and left
             to grow it would push the instruments off the top of the column and shift the music
             under it on every new row. -->
        <nc-slot-grid [cells]="cells()" (pick)="sfxToggle.emit($event)" />
      </div>
    </div>
  `,
  host: { class: 'block min-h-0' },
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
  readonly duplicate = output<string>();
  readonly edit = output<string>();
  readonly sfxToggle = output<number>();
  private readonly transloco = inject(TranslocoService);

  /**
   * The bank, which reaches as far as the highest slot anybody has used and one row further.
   *
   * There is no last slot: a game may put a sound effect at any number it likes, and the row of
   * free cells at the end is where the next one goes.
   */
  protected readonly cells = computed<SlotCell[]>(() => {
    const assigned = this.sfx();
    const current = this.patternId();
    const taken = [...assigned.keys()].map(Number).filter((n) => Number.isInteger(n) && n >= 0);
    return slotRange(taken, COLUMNS).map((n) => {
      const pid = assigned.get(String(n));
      return {
        n,
        state: !pid ? 'empty' : pid === current ? 'current' : 'filled',
        label: this.transloco.translate('editor.sound.sfxSlot', { n }),
      };
    });
  });
}
