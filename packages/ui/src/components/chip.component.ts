import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { IconComponent } from './icon.component';

export type ChipTone = 'neutral' | 'gold' | 'hot' | 'jade' | 'sky' | 'orange';

const TONES: Record<ChipTone, string> = {
  neutral: 'bg-raised text-ink-2 border-line',
  gold: 'bg-gold text-on-accent border-gold',
  hot: 'bg-hot text-on-accent-dark border-hot',
  jade: 'bg-jade text-on-accent border-jade',
  sky: 'bg-sky text-on-accent border-sky',
  orange: 'bg-orange text-on-accent border-orange',
};

/** Small labelled token: tags, status badges, author chips. */
@Component({
  selector: 'nc-chip',
  imports: [IconComponent],
  template: `
    <ng-content />
    @if (removable()) {
      <button
        type="button"
        class="-mr-0.5 inline-flex cursor-pointer opacity-70 transition-opacity duration-100 hover:opacity-100"
        aria-label="Remove"
        (click)="removed.emit()"
      >
        <nc-icon name="close" [size]="12" />
      </button>
    }
  `,
  host: { '[class]': 'classes()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChipComponent {
  readonly tone = input<ChipTone>('neutral');
  readonly removable = input(false);
  /**
   * A **badge** names a state the product chose — DRAFT, PUBLISHED — so it is shouted in caps.
   * A **tag** is a word somebody typed, and the design prints it as they typed it: `arcade`,
   * `one-button`, `Adventure`. Uppercasing those was the app inventing a house style for user
   * content, and it cost the roomier shape the artboard gives them too.
   */
  readonly kind = input<'badge' | 'tag'>('badge');
  readonly removed = output();
  protected readonly classes = computed(() => {
    const shape =
      this.kind() === 'tag'
        ? 'h-[29px] px-[10px] [text-transform:none]'
        : 'h-[22px] px-1 uppercase tracking-tag';
    return `inline-flex items-center gap-0.5 rounded-xs border font-mono text-label ${shape} ${TONES[this.tone()]}`;
  });
}
