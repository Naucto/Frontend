import { computed, Directive, input } from '@angular/core';

/** `danger` takes something away; `hot` is the action of a recording under way. */
export type MediaActionTone = 'default' | 'danger' | 'hot';

const CELL =
  'flex min-w-0 flex-1 cursor-pointer items-center justify-center gap-0.75 font-ui text-label uppercase ' +
  'transition-colors duration-100 not-first:border-l-3 not-first:border-line-strong ' +
  'disabled:cursor-default disabled:text-ink-4';

const TONES: Record<MediaActionTone, string> = {
  default: 'text-ink hover:text-gold-ink focus-visible:text-gold-ink focus-within:text-gold-ink',
  danger: 'text-ink hover:text-hot-ink focus-visible:text-hot-ink',
  hot: 'text-hot-ink hover:text-ink focus-visible:text-ink',
};

/**
 * One action of the bar along the foot of an `nc-media-frame`. The actions share the bar's width
 * and a rule stands between two of them. On a `label`, it is the face of a file input it holds.
 */
@Directive({
  selector: 'button[ncMediaAction], label[ncMediaAction]',
  host: { '[class]': 'classes()' },
})
export class MediaActionDirective {
  readonly tone = input<MediaActionTone>('default');
  protected readonly classes = computed(() => `${CELL} ${TONES[this.tone()]}`);
}
