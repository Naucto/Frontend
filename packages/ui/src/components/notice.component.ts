import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';

import { type IconName } from '../icons/paths';
import { ButtonDirective } from './button.directive';
import { IconComponent } from './icon.component';

/**
 * How loud the notice is: `info` for something that happened, `success` for something that went
 * through, `warn` for something to know, `danger` for something that blocks.
 */
export type NoticeTone = 'info' | 'success' | 'warn' | 'danger';

/**
 * The tone is said twice — by the colour and by the mark — because colour alone is the first thing
 * a colour-blind reader loses.
 */
const TONES: Record<NoticeTone, { frame: string; ink: string; icon: IconName }> = {
  info: { frame: 'bevel-edge-sky bevel-fill-sky-wash', ink: 'text-sky-ink', icon: 'info-box' },
  success: { frame: 'bevel-edge-jade bevel-fill-jade-wash', ink: 'text-jade-ink', icon: 'check' },
  warn: {
    frame: 'bevel-edge-gold bevel-fill-gold-wash',
    ink: 'text-gold-ink',
    icon: 'warning-box',
  },
  danger: { frame: 'bevel-edge-hot bevel-fill-hot-wash', ink: 'text-hot-ink', icon: 'alert' },
};

/**
 * Where the notice sits: in the flow of a body, framed in its tone, or as a full-width band of the
 * panel it belongs to, where the tone colours the mark and the title alone.
 */
export type NoticeVariant = 'inline' | 'band';

/**
 * Something the product needs to say about the state of something: a mark, an optional title in the
 * tone's ink, the copy, and whatever acts on it. A toast is this same shape with a dismiss button.
 *
 * Actions are projected with the `actions` attribute and are meant to be ghost buttons, which is
 * why their row is pulled left: a ghost button has no frame at rest, so its label is what lines up
 * with the copy above it.
 */
@Component({
  selector: 'nc-notice',
  imports: [IconComponent, ButtonDirective],
  templateUrl: './notice.component.html',
  host: { class: 'flex items-start gap-1.5', '[class]': 'shellClass()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NoticeComponent {
  readonly tone = input<NoticeTone>('warn');
  readonly variant = input<NoticeVariant>('inline');
  readonly title = input<string>();
  readonly dismissible = input(false, { transform: booleanAttribute });
  readonly dismissLabel = input('Dismiss');
  readonly dismissed = output();

  protected readonly look = computed(() => TONES[this.tone()]);

  protected readonly shellClass = computed(() =>
    this.variant() === 'band'
      ? 'border-b-3 border-line bg-raised px-[18px] py-[14px]'
      : `flat-sm py-1.5 pr-1.5 pl-[14px] ${this.look().frame}`,
  );
}
