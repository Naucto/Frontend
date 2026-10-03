import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * The Naucto mark. Inline rather than an `<img>`, because the mark has to change colour with the
 * theme and an image cannot read a token.
 */
@Component({
  selector: 'nc-logo',
  templateUrl: './logo.component.svg',
  host: { class: 'inline-flex shrink-0 items-center justify-center leading-none text-gold-ink' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LogoComponent {
  readonly size = input(32);
}
