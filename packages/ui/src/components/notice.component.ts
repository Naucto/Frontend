import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { IconComponent } from './icon.component';

/** How loud the notice is: `warn` for something to know, `danger` for something that blocks. */
export type NoticeTone = 'warn' | 'danger';

const TONES: Record<NoticeTone, string> = {
  warn: 'text-orange-ink',
  danger: 'text-hot-ink',
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
    <nc-icon name="alert" [size]="12" class="mt-[1px] shrink-0" />
    <span class="min-w-0"><ng-content /></span>
  `,
  host: { class: 'flex items-start gap-0.75 py-1 text-meta', '[class]': 'toneClass()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NoticeComponent {
  readonly tone = input<NoticeTone>('warn');

  protected readonly toneClass = computed(() => TONES[this.tone()]);
}
