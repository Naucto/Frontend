import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Uppercase, tracked meta label used above fields and sections ("SUMMARY", "PUBLISHING"). */
@Component({
  selector: 'nc-label',
  template: '<ng-content />',
  host: { class: 'label block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LabelComponent {}
