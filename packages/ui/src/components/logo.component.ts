import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';

/** `mark` is the moon alone, square; `wordmark` is the name with the moon as its C. */
export type LogoVariant = 'mark' | 'wordmark';

const MOON = '[transform-box:fill-box] origin-center';

/**
 * The Naucto logo. Inline rather than an `<img>`, because it has to change colour with the theme
 * and an image cannot read a token.
 */
@Component({
  selector: 'nc-logo',
  templateUrl: './logo.component.svg',
  host: {
    class: 'group/logo inline-flex shrink-0 items-center justify-center leading-none text-gold-ink',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LogoComponent {
  /** Height in pixels; the wordmark's width follows from it. */
  readonly size = input(32);
  readonly variant = input<LogoVariant>('mark');
  /**
   * A wordmark that leads somewhere rests dim; pointed at, it lights and its moon turns. Off, it
   * stands lit.
   */
  readonly link = input(false, { transform: booleanAttribute });

  protected readonly lettersClass = computed(() =>
    this.link()
      ? 'text-ink-3 transition-colors duration-200 group-hover/logo:text-ink'
      : 'text-ink',
  );
  protected readonly moonClass = computed(() =>
    this.link()
      ? `${MOON} text-ink-3 [transition:rotate_450ms_cubic-bezier(0.34,1.56,0.64,1),color_200ms] group-hover/logo:rotate-45 group-hover/logo:text-active-ink`
      : `${MOON} text-active-ink`,
  );
}
