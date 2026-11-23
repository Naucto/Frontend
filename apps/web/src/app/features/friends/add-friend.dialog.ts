import { DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { friendsControllerSend } from '@naucto/api-client';
import { DialogShellComponent, ToastService } from '@naucto/ui';

import { unwrap } from '../../core/api/api-errors';
import { PersonSearchComponent } from '../../shared/person-search.component';
import type { PersonHit } from '../../shared/queries/search.queries';

/**
 * Find a person, then ask them.
 *
 * What is typed is resolved to somebody you pick rather than posted as an identifier and coming
 * back 404: a name is not unique, and the request has to go to a person.
 */
@Component({
  selector: 'nc-add-friend-dialog',
  imports: [TranslocoDirective, DialogShellComponent, PersonSearchComponent],
  templateUrl: './add-friend.dialog.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddFriendDialog {
  readonly ref = inject<DialogRef<boolean>>(DialogRef);
  private readonly toasts = inject(ToastService);
  private readonly transloco = inject(TranslocoService);

  /** The server's own message tells the refusals apart: already friends, a request already sent. */
  protected send(person: PersonHit): void {
    void friendsControllerSend({ body: { userId: person.id } })
      .then(unwrap)
      .then(() => {
        this.toasts.show(this.transloco.translate('friends.sent'), 'success');
        this.ref.close(true);
      })
      .catch((error: unknown) => {
        this.toasts.show(error instanceof Error ? error.message : 'Request failed', 'error');
      });
  }
}
