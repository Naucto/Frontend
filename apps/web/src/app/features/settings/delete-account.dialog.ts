import { DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { ButtonDirective, DialogShellComponent, FieldComponent, InputDirective } from '@naucto/ui';

/**
 * The account-deletion confirmation for an account that signs in with a password, which the
 * server asks for before it deletes anything. Closes with the password typed, or nothing.
 */
@Component({
  selector: 'nc-delete-account-dialog',
  imports: [
    TranslocoDirective,
    ButtonDirective,
    DialogShellComponent,
    FieldComponent,
    InputDirective,
  ],
  templateUrl: './delete-account.dialog.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeleteAccountDialog {
  protected readonly ref = inject<DialogRef<string>>(DialogRef);
  protected readonly password = signal('');
}
