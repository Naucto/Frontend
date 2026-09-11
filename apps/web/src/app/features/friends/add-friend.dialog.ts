import { DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { friendsApi } from '@app/core/api/planned.api';
import { type PersonHit, searchPeople } from '@app/shared/queries/search.queries';
import { UserAvatarComponent } from '@app/shared/user-avatar.component';
import { TranslocoDirective } from '@jsverse/transloco';
import {
  ButtonDirective,
  DialogShellComponent,
  FieldComponent,
  InputDirective,
  ToastService,
} from '@naucto/ui';
import { injectQuery } from '@tanstack/angular-query-experimental';

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
  template: `
    <nc-dialog-shell *transloco="let t" [title]="t('friends.addFriend')">
      <nc-field [label]="t('friends.codePlaceholder')" for="friend-query">
        <input
          ncInput
          id="friend-query"
          class="w-full"
          autocomplete="off"
          [value]="query()"
          (input)="query.set($any($event.target).value)"
        />
      </nc-field>

      @if (term()) {
        <div class="mt-1.5 grid gap-0.5" role="list">
          @if (hits.isError()) {
            <p class="text-body text-hot-ink">{{ searchError() }}</p>
          } @else if (hits.isPending()) {
            <p class="text-body text-ink-3">{{ t('friends.searching') }}</p>
          } @else {
            @for (u of hits.data(); track u.id) {
              <div
                role="listitem"
                class="flex items-center gap-1.5 rounded-sm border border-line bg-raised px-1.5 py-1"
              >
                <nc-user-avatar [name]="u.nickname || u.username" [userId]="u.id" [size]="28" />
                <div class="min-w-0 flex-1">
                  <div class="truncate text-meta text-ink">{{ u.nickname || u.username }}</div>
                  <div class="text-micro text-ink-4">{{ '@' + u.username }}</div>
                </div>
                <button ncButton variant="secondary" size="sm" (click)="send(u.id)">
                  {{ t('friends.add') }}
                </button>
              </div>
            } @empty {
              <p class="text-body text-ink-3">{{ t('friends.noMatch', { q: term() }) }}</p>
            }
          }
        </div>
      }

      <button ncButton variant="ghost" footer (click)="ref.close()">
        {{ t('net.cancel') }}
      </button>
    </nc-dialog-shell>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddFriendDialog {
  readonly ref = inject<DialogRef<boolean>>(DialogRef);
  private readonly toasts = inject(ToastService);
  protected readonly query = signal('');
  protected readonly term = computed(() => this.query().trim());

  /**
   * The hub's suggestion panel is the model: results from the first character, and the asking
   * amortised by the cache rather than by a timer, which is why nothing here debounces.
   */
  protected readonly hits = injectQuery(() => ({
    queryKey: ['search', 'people', this.term()],
    queryFn: (): Promise<PersonHit[]> => searchPeople(this.term(), RESULTS_SHOWN),
    enabled: this.term().length > 0,
    staleTime: 30_000,
  }));

  /** A refused search is not an empty one: saying "nobody called that" would be a made-up answer. */
  protected readonly searchError = computed(() => {
    const e: unknown = this.hits.error();
    return e instanceof Error ? e.message : 'Could not search for people just now';
  });

  protected send(userId: number): void {
    void friendsApi
      .send({ userId })
      .then(() => {
        this.toasts.show('Request sent', 'success');
        this.ref.close(true);
      })
      .catch((e: unknown) => {
        this.toasts.show(e instanceof Error ? e.message : 'Request failed', 'error');
      });
  }
}
