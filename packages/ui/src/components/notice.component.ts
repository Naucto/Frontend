import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { IconComponent } from './icon.component';

/** How loud the notice is: `warn` for something to know, `danger` for something that blocks. */
export type NoticeTone = 'warn' | 'danger';

const TONES: Record<NoticeTone, string> = {
  warn: 'text-orange-ink',
  danger: 'text-hot-ink',
};

/**
 * Where the notice sits: in the flow of a body, or as a band of the panel it belongs to.
 *
 * A band is a section like any other — full width, its own ground and its own closing rule — so it
 * reads as part of the panel's structure rather than as a line someone slipped in. The tone then
 * belongs to the mark alone: a whole sentence in the warning colour on a raised ground is a second
 * emphasis competing with the first.
 */
export type NoticeVariant = 'inline' | 'band';

const VARIANTS: Record<NoticeVariant, string> = {
  inline: 'gap-0.75 py-1',
  band: 'gap-[9px] border-b border-line bg-raised px-[18px] py-[14px] text-ink-body',
};

/**
 * A short line the product needs to say about the state of something, marked so it is not mistaken
 * for the copy around it.
 *
 * The diamond carries the weight — the design leads every one of these with it, and a sentence in a
 * warning colour with nothing in front of it reads as emphasis rather than as a notice. The text
 * wraps beside the mark rather than under it, so a second line still reads as the same statement.
 */
@Component({
  selector: 'nc-notice',
  imports: [IconComponent],
  template: `
    <nc-icon name="alert" [size]="12" class="mt-[1px] shrink-0" [class]="markClass()" />
    <span class="min-w-0"><ng-content /></span>
  `,
  host: { class: 'flex items-start text-meta', '[class]': 'shellClass()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NoticeComponent {
  readonly tone = input<NoticeTone>('warn');
  readonly variant = input<NoticeVariant>('inline');

  protected readonly shellClass = computed(
    () => `${VARIANTS[this.variant()]} ${this.variant() === 'inline' ? TONES[this.tone()] : ''}`,
  );

  /** Empty inline, where the mark inherits the tone the whole notice is already set in. */
  protected readonly markClass = computed(() =>
    this.variant() === 'band' ? TONES[this.tone()] : '',
  );
}
