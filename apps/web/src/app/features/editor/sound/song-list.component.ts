import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { type Pattern, type Song, SONG_SLOTS } from '@naucto/engine';
import { HelpDotComponent, IconComponent, NumberFieldComponent } from '@naucto/ui';

/**
 * A music, as a tracker writes one: a column of pattern numbers, played top to bottom.
 *
 * Numbers, not names, all the way down. A row says which pattern plays; the pattern says what it
 * sounds like. Naming either would mean reading two things to know one.
 */
@Component({
  selector: 'nc-song-list',
  imports: [TranslocoDirective, IconComponent, HelpDotComponent, NumberFieldComponent],
  template: `
    <div *transloco="let t" class="border-t border-line px-1.5 py-1.25">
      <div class="mb-1 flex items-center gap-1">
        <span class="label text-ink-3">{{ t('editor.sound.music') }}</span>
        <span class="flex-1"></span>
        <nc-number-field
          [label]="t('editor.sound.musicSlot')"
          [value]="slot()"
          [max]="MAX_SLOT"
          (requested)="slotChange.emit($event)"
        />
        <nc-help-dot [text]="t('editor.sound.musicHelp')" />
      </div>

      @if (rows().length) {
        <div class="grid gap-0.5" role="list">
          @for (row of rows(); track row.index) {
            <div class="flex items-center gap-0.5" role="listitem">
              <span class="w-2.5 font-mono text-label text-ink-4 tabular-nums">
                {{ pad(row.index) }}
              </span>
              <!-- The pattern's number, which is the whole of what a row says. -->
              <span
                class="flex h-[22px] flex-1 items-center rounded-xs border px-1 font-mono text-label"
                [class]="row.playing ? 'border-gold bg-gold text-on-accent' : rowClass(row.known)"
              >
                {{ row.label }}
              </span>
              <button
                type="button"
                class="text-ink-4 hover:text-hot-ink"
                [attr.aria-label]="t('editor.sound.removeRow', { n: row.index })"
                (click)="removeRow.emit(row.index)"
              >
                <nc-icon name="close" [size]="12" />
              </button>
            </div>
          }
        </div>
      } @else {
        <p class="text-meta text-ink-3">{{ t('editor.sound.musicEmpty') }}</p>
      }

      <!-- Appends the pattern being edited, which is the one whose number you have in front of you. -->
      <button
        type="button"
        class="mt-1 flex h-[22px] w-full items-center justify-center gap-0.5 rounded-xs border border-line text-ink-3 hover:border-line-strong hover:text-ink disabled:opacity-40"
        [disabled]="current() === null"
        (click)="appendCurrent.emit()"
      >
        <nc-icon name="plus" [size]="12" />
        <span class="label">{{ t('editor.sound.addRow') }}</span>
        @if (current(); as c) {
          <span class="font-mono text-label text-ink">{{ pad(c.slot) }}</span>
        }
      </button>
    </div>
  `,
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SongListComponent {
  readonly slot = input.required<number>();
  readonly song = input<Song | null>(null);
  readonly patterns = input.required<Map<string, Pattern>>();
  /** The pattern being edited, as against any pattern the chain already holds. */
  readonly current = input<Pattern | null>(null);
  /** Which link of the chain is sounding, or null when the music is not playing. */
  readonly playingIndex = input<number | null>(null);

  readonly slotChange = output<number>();
  readonly removeRow = output<number>();
  readonly appendCurrent = output();

  protected readonly MAX_SLOT = SONG_SLOTS - 1;

  protected readonly rows = computed(() => {
    const patterns = this.patterns();
    const playing = this.playingIndex();
    return (this.song()?.sequence ?? []).map((id, index) => {
      const pattern = patterns.get(id);
      return {
        index,
        known: pattern !== undefined,
        // A row whose pattern is gone keeps its place: dropping it would renumber every row under
        // it, and a row number is what the reader is looking at.
        label: pattern ? this.pad(pattern.slot) : '--',
        playing: index === playing,
      };
    });
  });

  protected pad(n: number): string {
    return String(n).padStart(2, '0');
  }

  protected rowClass(known: boolean): string {
    return known ? 'border-line-strong bg-raised text-ink-body' : 'border-line bg-inset text-ink-4';
  }
}
