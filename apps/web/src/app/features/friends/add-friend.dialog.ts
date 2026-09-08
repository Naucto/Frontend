import { DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { friendsApi, usersApi, type UserSummaryDto } from '@app/core/api/planned.api';
import { UserAvatarComponent } from '@app/shared/user-avatar.component';
import { TranslocoDirective } from '@jsverse/transloco';
import {
  ButtonDirective,
  DialogShellComponent,
  FieldComponent,
  InputDirective,
  ToastService,
} from '@naucto/ui';

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
        <div class="flex gap-1">
          <input
            ncInput
            id="friend-query"
            class="flex-1"
            autocomplete="off"
            [value]="query()"
            (input)="onQuery($any($event.target).value)"
            (keydown.enter)="submit()"
          />
          <button ncButton variant="primary" (click)="submit()" [disabled]="!query().trim()">
            {{ t('friends.search') }}
          </button>
        </div>
      </nc-field>

      @if (searched()) {
        <div class="mt-1.5 grid gap-0.5" role="list">
          @for (u of results(); track u.id) {
            <div
              role="listitem"
              class="flex items-center gap-1.5 rounded-sm border border-line bg-raised px-1.5 py-1"
            >
              <nc-user-avatar [name]="u.nickname || u.username" [userId]="u.id" [size]="28" />
              <div class="min-w-0 flex-1">
                <div class="truncate text-meta text-ink">{{ u.nickname || u.username }}</div>
                <div class="text-micro text-ink-4">{{ '@' + u.username }}</div>
              </div>
              <button ncButton variant="secondary" size="sm" (click)="send({ userId: u.id })">
                {{ t('friends.add') }}
              </button>
            </div>
          } @empty {
            <p class="text-body text-ink-3">{{ t('friends.noMatch', { q: query() }) }}</p>
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
  protected readonly results = signal<UserSummaryDto[]>([]);
  protected readonly searched = signal(false);

  protected onQuery(v: string): void {
    this.query.set(v);
    this.searched.set(false);
  }

  protected submit(): void {
    const v = this.query().trim();
    if (v) void this.search(v);
  }

  private async search(nickname: string): Promise<void> {
    try {
      this.results.set(await usersApi.search(nickname));
    } catch {
      this.results.set([]);
    }
    this.searched.set(true);
  }

  protected send(body: { userId: number }): void {
    void friendsApi
      .send(body)
      .then(() => {
        this.toasts.show('Request sent', 'success');
        this.ref.close(true);
      })
      .catch((e: unknown) => {
        this.toasts.show(e instanceof Error ? e.message : 'Request failed', 'error');
      });
  }
}
