import { ChangeDetectionStrategy, Component, output } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { ButtonDirective, IconComponent } from '@naucto/ui';

/**
 * The four ways to turn a block over, as a strip of buttons.
 *
 * It says nothing about what is turned: the page that shows it owns the selection and answers
 * each output, which is what lets ART's pixels and MAP's tiles share one strip.
 */
@Component({
  selector: 'nc-transform-bar',
  imports: [TranslocoDirective, ButtonDirective, IconComponent],
  templateUrl: './transform-bar.component.html',
  host: { class: 'inline-flex' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TransformBarComponent {
  readonly flipH = output();
  readonly flipV = output();
  readonly rotateCw = output();
  readonly rotateCcw = output();
}
