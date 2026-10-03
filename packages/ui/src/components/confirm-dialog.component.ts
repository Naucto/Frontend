import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { ButtonDirective } from './button.directive';
import { DialogShellComponent } from './dialog-shell.component';

export interface ConfirmDialogData {
  title: string;
  /**
   * What goes, then what that means, a paragraph each: a list, or one string with a blank line
   * between them, which is how a locale file writes it.
   */
  message: string | readonly string[];
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

/** Yes/no dialog; resolves `true` on confirm. */
@Component({
  selector: 'nc-confirm-dialog',
  imports: [ButtonDirective, DialogShellComponent],
  templateUrl: './confirm-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmDialogComponent {
  protected readonly data = inject<ConfirmDialogData>(DIALOG_DATA);
  protected readonly ref = inject<DialogRef<boolean>>(DialogRef);
  protected readonly paragraphs =
    typeof this.data.message === 'string' ? this.data.message.split(/\n\s*\n/) : this.data.message;
}
