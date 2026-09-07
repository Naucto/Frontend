import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { friendsApi, usersApi, type UserSummaryDto } from '@app/core/api/planned.api';
import { TranslocoDirective } from '@jsverse/transloco';
import {
  AvatarComponent,
  ButtonDirective,
  DialogShellComponent,
  FieldComponent,
  InputDirective,
  ToastService,
} from '@naucto/ui';

export interface AddFriendData {
  /** Shown so the person can hand it out instead of searching. */
  friendCode: string;
}

/** Eight characters, letters and digits — what `meApi.get().friendCode` mints. */
const FRIEND_CODE = /^[a-z0-9]{8}$/i;

/**
 * "Search a nickname, or hand out your code." Both halves of the design's copy are real here: a
 * code goes straight to the request, and anything else is resolved to a person you pick, rather
 * than being posted as a code and coming back 404.
 */
@Component({
  selector: 'nc-add-friend-dialog',
  imports: [
    TranslocoDirective,
    AvatarComponent,
    ButtonDirective,
    DialogShellComponent,
    FieldComponent,
    InputDirective,
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
            {{ isCode() ? t('friends.addFriend') : t('friends.search') }}
          </button>
        </div>
      </nc-field>

      @if (!isCode() && searched()) {
        <div class="mt-1.5 grid gap-0.5" role="list">
          @for (u of results(); track u.id) {
            <div
              role="listitem"
              class="flex items-center gap-1.5 rounded-sm border border-line bg-raised px-1.5 py-1"
            >
              <nc-avatar [name]="u.nickname || u.username" [id]="u.id" [size]="28" />
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

      <p class="mt-1.5 text-body text-ink-3">
        {{ t('friends.yourCodeIs') }}
        <span class="font-mono text-meta tracking-strip text-gold-ink">{{ myCode() || '—' }}</span>
      </p>

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
  protected readonly myCode = signal(inject<AddFriendData>(DIALOG_DATA).friendCode.toUpperCase());
  protected readonly query = signal('');
  protected readonly results = signal<UserSummaryDto[]>([]);
  protected readonly searched = signal(false);
  protected readonly isCode = computed(() => FRIEND_CODE.test(this.query().trim()));

  protected onQuery(v: string): void {
    this.query.set(v);
    this.searched.set(false);
  }

  protected submit(): void {
    const v = this.query().trim();
    if (!v) return;
    if (this.isCode()) {
      this.send({ friendCode: v.toUpperCase() });
      return;
    }
    void this.search(v);
  }

  private async search(nickname: string): Promise<void> {
    try {
      this.results.set(await usersApi.search(nickname));
    } catch {
      this.results.set([]);
    }
    this.searched.set(true);
  }

  protected send(body: { userId?: number; friendCode?: string }): void {
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
