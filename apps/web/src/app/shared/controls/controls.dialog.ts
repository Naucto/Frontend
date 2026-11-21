import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { DialogShellComponent } from '@naucto/ui';

import { ControlsComponent } from './controls.component';

/** The controls of this device, over the game being played. */
@Component({
  selector: 'nc-controls-dialog',
  imports: [TranslocoDirective, DialogShellComponent, ControlsComponent],
  template: `
    <nc-dialog-shell *transloco="let t" [title]="t('controls.title')">
      <nc-controls class="-mr-1 mt-2 max-h-[calc(100dvh-240px)] overflow-y-auto pr-1" />
    </nc-dialog-shell>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ControlsDialogComponent {}
