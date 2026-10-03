import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';

import { colourOf, IDENTITY_COLOURS, inkFor } from '../palette';

/** The three colours reserved for live collaboration cursors and carets. */
export type PresenceColour = 'sky' | 'blush' | 'jade';

/**
 * The six a person may choose to be drawn in: the presence three, plus the three accents.
 *
 * Wider than `PresenceColour` on purpose — a collaboration cursor has to be one of three that never
 * collide, whereas a person picking their own colour is choosing a label and may pick any of six.
 */
export type IdentityAccent = PresenceColour | 'gold' | 'orange' | 'hot';

/** How a call site may pin an avatar's fill when the identity colour is not what it means. */
export type AvatarColour = IdentityAccent | 'neutral' | number | `#${string}`;

/**
 * Each colour a person may wear, as a CSS fill and as the Tailwind background class that paints a
 * swatch of it, in the order a picker offers them.
 *
 * The classes are written out rather than built from the name: Tailwind reads the source text, so a
 * class string assembled at runtime does not exist by the time the stylesheet is built.
 */
export const PERSONAL_COLOURS: Record<IdentityAccent, { fill: string; swatch: string }> = {
  sky: { fill: 'var(--color-presence-sky)', swatch: 'bg-presence-sky' },
  blush: { fill: 'var(--color-presence-blush)', swatch: 'bg-presence-blush' },
  jade: { fill: 'var(--color-presence-jade)', swatch: 'bg-presence-jade' },
  gold: { fill: 'var(--color-gold)', swatch: 'bg-gold' },
  orange: { fill: 'var(--color-orange)', swatch: 'bg-orange' },
  hot: { fill: 'var(--color-hot)', swatch: 'bg-hot' },
};

/**
 * Square avatar: image when available, else the first letter on the person's colour.
 *
 * The colour comes from the person, not the call site — pass `id` (or rely on `name`) and the same
 * user is the same colour everywhere. `colour` overrides it where the fill means something other
 * than who the person is.
 */
@Component({
  selector: 'nc-avatar',
  templateUrl: './avatar.component.html',
  host: {
    '[class]': 'classes()',
    '[style.width.px]': 'size()',
    '[style.height.px]': 'size()',
    '[style.font-size.px]': 'Math.round(size() * 0.4)',
    '[style.background]': 'fill()',
    '[style.color]': 'ink()',
    '[attr.title]': 'name()',
    role: 'img',
    '[attr.aria-label]': 'name()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AvatarComponent {
  readonly name = input.required<string>();
  readonly src = input<string | null>();
  /** Identity key for the stable colour; falls back to the name. */
  readonly id = input<string | number>();
  /** A presence colour, `gold` for the viewer's own row of a roster, `neutral`, an index, or a hex. */
  readonly colour = input<AvatarColour>();
  readonly size = input(24);
  /** Overlap the previous avatar, for presence stacks. */
  readonly overlap = input(false, { transform: booleanAttribute });

  protected readonly Math = Math;
  protected readonly initial = computed(() => (this.name().trim()[0] ?? '?').toUpperCase());

  protected readonly fill = computed(() => {
    const chosen = this.colour();
    if (chosen === 'neutral') {
      return 'var(--color-line)';
    }
    if (typeof chosen === 'number') {
      return IDENTITY_COLOURS[chosen % IDENTITY_COLOURS.length] as string;
    }
    if (chosen && chosen in PERSONAL_COLOURS) {
      return PERSONAL_COLOURS[chosen as IdentityAccent].fill;
    }
    if (chosen) {
      return chosen;
    }
    return colourOf(this.id() ?? this.name());
  });

  protected readonly ink = computed(() => {
    const fill = this.fill();
    if (fill === 'var(--color-line)') {
      return 'var(--color-ink-2)';
    }
    return fill.startsWith('var(') ? 'var(--color-on-accent)' : inkFor(fill);
  });

  protected readonly classes = computed(() => {
    // The design keeps 2px corners on the small card avatars and 3px with a hairline from 24px up.
    const large = this.size() >= 24;
    return [
      'inline-flex shrink-0 items-center justify-center overflow-hidden font-mono uppercase',
      large ? 'rounded-sm border border-line-strong' : 'rounded-xs',
      this.overlap() ? '-ml-1 ring-1 ring-panel first:ml-0' : '',
    ].join(' ');
  });
}
