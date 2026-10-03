import { DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { friendsControllerSend } from '@naucto/api-client';
import {
  ButtonDirective,
  DialogShellComponent,
  FieldComponent,
  InputDirective,
  ToastService,
} from '@naucto/ui';
import { injectQuery } from '@tanstack/angular-query-experimental';

import { unwrap } from '../../core/api/api-errors';
import { qk } from '../../shared/queries/query-keys';
import { type PersonHit, searchPeople } from '../../shared/queries/search.queries';
import { UserAvatarComponent } from '../../shared/user-avatar.component';

/** As many people as the panel can show without the dialog growing a scrollbar of its own. */
const RESULTS_SHOWN = 8;

/**
 * Find a person, then ask them.
 *
 * What is typed is resolved to somebody you pick rather than posted as an identifier and coming
 * back 404: a name is not unique, and the request has to go to a person.
 */
@Component({
  selector: 'nc-add-friend-dialog',
  imports: [
    TranslocoDirective,
    ButtonDirective,
    DialogShellComponent,
    FieldComponent,
    InputDirective,
    UserAvatarComponent,
  ],
  templateUrl: './add-friend.dialog.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddFriendDialog {
  readonly ref = inject<DialogRef<boolean>>(DialogRef);
  private readonly toasts = inject(ToastService);
  private readonly transloco = inject(TranslocoService);
  protected readonly query = signal('');
  protected readonly term = computed(() => this.query().trim());

  /**
   * Not debounced: the query cache amortises the asking, so results start at the first character.
   */
  protected readonly hits = injectQuery(() => ({
    queryKey: qk.searchPeople(this.term(), RESULTS_SHOWN),
    queryFn: (): Promise<PersonHit[]> => searchPeople(this.term(), RESULTS_SHOWN),
    enabled: this.term().length > 0,
    staleTime: 30_000,
  }));

  /** A refused search is not an empty one: saying "nobody called that" would be a made-up answer. */
  protected readonly searchError = computed(() => {
    const error: unknown = this.hits.error();
    return error instanceof Error ? error.message : this.transloco.translate('share.searchFailed');
  });

  protected send(userId: number): void {
    void friendsControllerSend({ body: { userId } })
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
