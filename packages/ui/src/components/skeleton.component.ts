import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * A block standing in for content that has not arrived, so a grid does not reflow when it does.
 *
 * Not a shimmer sweep — that gradient belongs to a different design language. This is the sunken
 * well the design already uses for a section floor, breathing between two opacities, which reads as
 * "the machine is working" in the same register as the rest of the console. `[data-reduce-motion]`
 * stops it, and it is `aria-hidden` because a screen reader should hear the surrounding live region,
 * not a wall of placeholders.
 *
 * The `no-cover` hatch is deliberately *not* reused here: that hatch already means "this game has no
 * cover", and a skeleton wearing it would say something false for as long as it is on screen.
 */
@Component({
  selector: 'nc-skeleton',
  template: '',
  host: {
    class: 'nc-skeleton block bg-sunken',
    'aria-hidden': 'true',
    '[class]': 'radius()',
    '[style.width]': 'width()',
    '[style.height]': 'height()',
  },
  styles: `
    :host {
      animation: nc-skeleton-breathe 1.6s ease-in-out infinite;
    }
    @keyframes nc-skeleton-breathe {
      0%,
      100% {
        opacity: 0.5;
      }
      50% {
        opacity: 0.85;
      }
    }
    :host-context([data-reduce-motion]) {
      animation: none;
      opacity: 0.65;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SkeletonComponent {
  /** Any CSS length; defaults to filling the row. */
  readonly width = input<string>('100%');
  readonly height = input<string>('1rem');
  readonly radius = input<'rounded-xs' | 'rounded-sm' | 'rounded-md' | 'rounded-none'>(
    'rounded-xs',
  );
}
