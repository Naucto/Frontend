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

/** How a call site may pin an avatar's fill when the identity colour is not what it means. */
export type AvatarColour = PresenceColour | 'neutral' | number | `#${string}`;

const PRESENCE_FILL: Record<PresenceColour, string> = {
  sky: 'var(--color-presence-sky)',
  blush: 'var(--color-presence-blush)',
  jade: 'var(--color-presence-jade)',
};

/**
 * Square avatar: image when available, else the first letter on the person's colour.
 *
 * The colour comes from the person, not the call site — pass `id` (or rely on `name`) and the same
 * user is the same colour everywhere. `colour` overrides it for the two cases where the fill means
 * something: a presence cursor, and the neutral account button in the top bar.
 */
@Component({
  selector: 'nc-avatar',
  template: `
    @if (src()) {
      <img [src]="src()" [alt]="name()" class="pixelated h-full w-full object-cover" />
    } @else {
      <span aria-hidden="true">{{ initial() }}</span>
    }
  `,
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
  /** A presence colour, `neutral`, a palette index, or an explicit hex. */
  readonly colour = input<AvatarColour>();
  readonly size = input(24);
  /** Overlap the previous avatar, for presence stacks. */
  readonly overlap = input(false, { transform: booleanAttribute });

  protected readonly Math = Math;
  protected readonly initial = computed(() => (this.name().trim()[0] ?? '?').toUpperCase());

  protected readonly fill = computed(() => {
    const chosen = this.colour();
    if (chosen === 'neutral') return 'var(--color-line)';
    if (typeof chosen === 'number')
      return IDENTITY_COLOURS[chosen % IDENTITY_COLOURS.length] as string;
    if (chosen && chosen in PRESENCE_FILL) return PRESENCE_FILL[chosen as PresenceColour];
    if (chosen) return chosen;
    return colourOf(this.id() ?? this.name());
  });

  protected readonly ink = computed(() => {
    const fill = this.fill();
    if (fill === 'var(--color-line)') return 'var(--color-ink-2)';
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
