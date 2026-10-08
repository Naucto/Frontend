import { DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { ButtonDirective, DialogShellComponent } from '@naucto/ui';

import { SignInFormComponent } from './sign-in-form.component';

/**
 * Sign in without leaving what you were doing.
 *
 * The routed page cannot serve here: navigating to it tears down the editor, its Y.Doc and the
 * session the reader was in the middle of opening, which is exactly the thing they were trying to
 * do. Closing with `true` means the caller may carry on.
 */
@Component({
  selector: 'nc-sign-in-dialog',
  imports: [TranslocoDirective, ButtonDirective, DialogShellComponent, SignInFormComponent],
  templateUrl: './sign-in.dialog.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignInDialogComponent {
  readonly ref = inject<DialogRef<boolean>>(DialogRef);
  /** Where a redirecting provider comes back to, which is the page the reader is standing on. */
  protected readonly here = location.pathname + location.search;
}
