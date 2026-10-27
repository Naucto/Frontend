import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { ButtonDirective, IconComponent, TooltipDirective } from '@naucto/ui';

import { FeedbackLauncher } from './feedback-launcher.service';

/** The bar's way to a bug report: one quiet glyph beside the bell, named by its tooltip. */
@Component({
  selector: 'nc-report-problem-button',
  imports: [TranslocoDirective, ButtonDirective, IconComponent, TooltipDirective],
  templateUrl: './report-problem-button.component.html',
  host: { class: 'contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportProblemButtonComponent {
  protected readonly launcher = inject(FeedbackLauncher);
}
