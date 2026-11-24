import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

const GLYPHS = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#$%&*+=<>?';

/**
 * A stand-in for content that has not arrived, so a grid does not reflow when it does.
 *
 * Two forms, one shimmer. Given `words`, it is a line of text that is not there yet: made-up words
 * of those lengths in the heading face, whose glyphs are the only thing the shimmer paints, at
 * whatever type size the caller's class sets. Without `words` it is a block of `width` × `height`,
 * for a picture. The band crosses in held steps rather than gliding, and stands still under
 * `prefers-reduced-motion` or `[data-reduce-motion]`.
 *
 * It is `aria-hidden` because a screen reader should hear the surrounding live region, not a wall
 * of placeholders. The `no-cover` hatch is deliberately *not* reused here: that hatch already means
 * "this game has no cover", and a skeleton wearing it would say something false for as long as it is
 * on screen.
 */
@Component({
  selector: 'nc-skeleton',
  template: '{{ text() }}',
  host: {
    'aria-hidden': 'true',
    class: 'block',
    '[class]': 'words() ? "glyphs w-fit font-display leading-[1.2] whitespace-pre" : ""',
    '[style.width]': 'words() ? null : width()',
    '[style.height]': 'words() ? null : height()',
  },
  styles: `
    :host {
      background: linear-gradient(
          90deg,
          var(--sk-0, var(--nc-inset)) 0 34%,
          var(--sk-1, var(--nc-line)) 34% 40%,
          var(--sk-2, var(--nc-line)) 40% 46%,
          var(--sk-3, var(--nc-line-strong)) 46% 54%,
          var(--sk-2, var(--nc-line)) 54% 60%,
          var(--sk-1, var(--nc-line)) 60% 66%,
          var(--sk-0, var(--nc-inset)) 66% 100%
        )
        0 0 / 200% 100%;
      animation: nc-shimmer 1.6s steps(20) infinite;
    }
    :host(.glyphs) {
      --sk-0: var(--nc-line-strong);
      --sk-1: var(--nc-ink-4);
      --sk-2: var(--nc-ink-3);
      --sk-3: var(--nc-ink-2);
      color: transparent;
      background-clip: text;
    }
    @keyframes nc-shimmer {
      from {
        background-position: 100% 0;
      }
      to {
        background-position: -100% 0;
      }
    }
    :host-context([data-reduce-motion]) {
      animation: none;
    }
    @media (prefers-reduced-motion: reduce) {
      :host {
        animation: none;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SkeletonComponent {
  /** Any CSS length; defaults to filling the row. */
  readonly width = input<string>('100%');
  readonly height = input<string>('1rem');
  /** The length of each made-up word of a text placeholder, e.g. `[7, 4, 6]`. */
  readonly words = input<readonly number[]>();

  protected readonly text = computed(() =>
    (this.words() ?? [])
      .map((length) =>
        Array.from({ length }, () => GLYPHS[Math.floor(Math.random() * GLYPHS.length)]).join(''),
      )
      .join(' '),
  );
}
