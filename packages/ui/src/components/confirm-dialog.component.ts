import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { ButtonDirective } from './button.directive';
import { DialogShellComponent } from './dialog-shell.component';

export interface ConfirmDialogData {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

/** Yes/no dialog; resolves `true` on confirm. */
@Component({
  selector: 'nc-confirm-dialog',
  imports: [ButtonDirective, DialogShellComponent],
  template: `
    <nc-dialog-shell [title]="data.title">
      <p class="text-body text-ink-body">{{ data.message }}</p>
      <ng-content />
      <ng-container footer>
        <button ncButton variant="ghost" (click)="ref.close(false)">
          {{ data.cancelLabel ?? 'Cancel' }}
        </button>
        <button ncButton [variant]="data.danger ? 'danger' : 'primary'" (click)="ref.close(true)">
          {{ data.confirmLabel ?? 'Confirm' }}
        </button>
      </ng-container>
    </nc-dialog-shell>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmDialogComponent {
  protected readonly data = inject<ConfirmDialogData>(DIALOG_DATA);
  protected readonly ref = inject<DialogRef<boolean>>(DialogRef);
}
