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
  template: `
    <div
      *transloco="let t"
      role="toolbar"
      [attr.aria-label]="t('editor.transform.label')"
      class="flex items-center gap-0.5"
    >
      <button
        ncButton
        variant="ghost"
        size="sm"
        iconOnly
        [attr.aria-label]="t('editor.transform.flipH')"
        (click)="flipH.emit()"
      >
        <nc-icon name="flip-horizontal" [size]="24" />
      </button>
      <button
        ncButton
        variant="ghost"
        size="sm"
        iconOnly
        [attr.aria-label]="t('editor.transform.flipV')"
        (click)="flipV.emit()"
      >
        <nc-icon name="flip-vertical" [size]="24" />
      </button>
      <button
        ncButton
        variant="ghost"
        size="sm"
        iconOnly
        [attr.aria-label]="t('editor.transform.rotateCw')"
        (click)="rotateCw.emit()"
      >
        <nc-icon name="rotate-cw" [size]="24" />
      </button>
      <!-- Pixelarticons draws one arrow; the other direction is the same glyph mirrored. -->
      <button
        ncButton
        variant="ghost"
        size="sm"
        iconOnly
        [attr.aria-label]="t('editor.transform.rotateCcw')"
        (click)="rotateCcw.emit()"
      >
        <nc-icon name="rotate-cw" [size]="24" class="-scale-x-100" />
      </button>
    </div>
  `,
  host: { class: 'inline-flex' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TransformBarComponent {
  readonly flipH = output();
  readonly flipV = output();
  readonly rotateCw = output();
  readonly rotateCcw = output();
}
