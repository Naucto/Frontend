import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';

import { MarkComponent } from './mark.component';

export type ChipTone = 'neutral' | 'gold' | 'hot' | 'jade' | 'sky' | 'orange';

const SOLID: Record<ChipTone, string> = {
  neutral: 'bevel-fill-raised',
  gold: 'bevel-edge-gold bevel-fill-gold text-on-accent',
  hot: 'bevel-edge-hot bevel-fill-hot text-on-hot',
  jade: 'bevel-edge-jade bevel-fill-jade text-on-accent',
  sky: 'bevel-edge-sky bevel-fill-sky text-on-accent',
  orange: 'bevel-edge-orange bevel-fill-orange text-on-accent',
};

/** The tint of an accent under its own ink. Only the accents that have a wash can be drawn so. */
const WASH: Partial<Record<ChipTone, string>> = {
  gold: 'bevel-edge-gold bevel-fill-gold-wash text-gold-ink',
  hot: 'bevel-edge-hot bevel-fill-hot-wash text-hot-ink',
  jade: 'bevel-edge-jade bevel-fill-jade-wash text-jade-ink',
  sky: 'bevel-edge-sky bevel-fill-sky-wash text-sky-ink',
};

const KINDS = {
  badge: { shape: 'h-(--nc-h-xs) px-[10px] text-label tracking-tag uppercase', ink: 'text-ink-2' },
  tag: { shape: 'h-[32px] px-1.5 text-small', ink: 'text-ink-body' },
};

/** Small labelled token: tags, status badges, author chips. */
@Component({
  selector: 'nc-chip',
  imports: [MarkComponent],
  templateUrl: './chip.component.html',
  host: { '[class]': 'classes()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChipComponent {
  readonly tone = input<ChipTone>('neutral');
  /** Draw the tone as a tint under its ink rather than as a solid fill. */
  readonly wash = input(false, { transform: booleanAttribute });
  readonly removable = input(false);
  /**
   * A **badge** names a state the product chose — DRAFT, PUBLISHED — so it is set in caps; a
   * **tag** is a word somebody typed, and is printed as typed.
   */
  readonly kind = input<'badge' | 'tag'>('badge');
  readonly removed = output();
  protected readonly classes = computed(() => {
    const kind = KINDS[this.kind()];
    const tone = (this.wash() ? WASH[this.tone()] : undefined) ?? SOLID[this.tone()];
    return `flat-sm inline-flex items-center gap-[6px] font-ui whitespace-nowrap ${kind.shape} ${this.tone() === 'neutral' ? kind.ink : ''} ${tone}`;
  });
}
