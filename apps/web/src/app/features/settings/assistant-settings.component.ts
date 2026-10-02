import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { injectAiKeys, invalidateAiKeys, revokeAiKey } from '@app/shared/queries/ai-keys.queries';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import {
  ButtonDirective,
  ConfirmDialogComponent,
  DialogService,
  EmptyStateComponent,
  ErrorStateComponent,
  SkeletonComponent,
  ToastService,
} from '@naucto/ui';
import { injectMutation, QueryClient } from '@tanstack/angular-query-experimental';

import { CreateAiKeyDialog } from './create-ai-key.dialog';

/**
 * The account's assistant keys: what they are, and the one call that matters — revoke the key.
 *
 * A key is the account's, so it reaches every project the account owns. There is nothing to link
 * and no per-game token.
 */
@Component({
  selector: 'nc-assistant-settings',
  imports: [
    TranslocoDirective,
    ButtonDirective,
    EmptyStateComponent,
    ErrorStateComponent,
    SkeletonComponent,
    DatePipe,
  ],
  template: `
    <div *transloco="let t">
      <p class="max-w-[62ch] pb-2 text-body leading-[1.65] text-ink-body">
        {{ t('ai.keys.lead') }}
      </p>

      @if (keys.isError()) {
        <nc-error-state
          [title]="t('ai.keys.failed')"
          [retryLabel]="t('ai.keys.create')"
          (retry)="keys.refetch()"
        />
      } @else if (keys.isPending()) {
        <nc-skeleton class="block h-16 w-full" />
      } @else if (!keys.data()?.length) {
        <nc-empty-state icon="lock" [title]="t('ai.keys.empty')" [hint]="t('ai.keys.emptyHint')">
          <button ncButton variant="primary" size="sm" (click)="create()">
            {{ t('ai.keys.create') }}
          </button>
        </nc-empty-state>
      } @else {
        <ul class="space-y-1">
          @for (key of keys.data(); track key.id) {
            <li class="border border-line p-1.5">
              <div class="flex flex-wrap items-baseline justify-between gap-1">
                <span class="text-body text-ink">{{ key.name }}</span>
                <button
                  ncButton
                  variant="ghost"
                  size="sm"
                  [disabled]="busy() === key.id"
                  (click)="confirmRevoke(key.id, key.name)"
                >
                  {{ t('ai.keys.revoke') }}
                </button>
              </div>
              <p class="text-meta text-ink-3">
                @if (key.expiresAt) {
                  {{ t('ai.keys.expiryDays', { count: daysLeft(key.expiresAt) }) }}
                } @else {
                  {{ t('ai.keys.expiryNever') }}
                }
                ·
                @if (key.lastUsedAt) {
                  {{ t('ai.keys.lastUsed') }} {{ key.lastUsedAt | date: 'short' }}
                } @else {
                  {{ t('ai.keys.lastUsedNever') }}
                }
              </p>
            </li>
          }
        </ul>
        <div class="mt-1 flex items-center gap-1">
          <button ncButton variant="primary" size="sm" (click)="create()">
            {{ t('ai.keys.create') }}
          </button>
          @if (atLimit()) {
            <span class="text-meta text-ink-3">{{ t('ai.keys.atLimit') }}</span>
          }
        </div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssistantSettings {
  private readonly qc = inject(QueryClient);
  private readonly dialogs = inject(DialogService);
  private readonly toasts = inject(ToastService);
  private readonly transloco = inject(TranslocoService);

  protected readonly keys = injectAiKeys();
  protected readonly busy = signal<string | null>(null);

  /** The ceiling the server holds, mirrored so the panel can say so before the round trip. */
  protected readonly atLimit = computed(() => (this.keys.data()?.length ?? 0) >= 20);

  private readonly act = injectMutation(() => ({
    mutationFn: async (run: () => Promise<void>) => {
      await run();
      await invalidateAiKeys(this.qc);
    },
  }));

  protected create(): void {
    this.dialogs.open(CreateAiKeyDialog).closed.subscribe((made) => {
      if (made !== true) return;
      void invalidateAiKeys(this.qc);
      this.toasts.show(this.transloco.translate('ai.keys.created'), 'success');
    });
  }

  protected confirmRevoke(keyId: string, name: string): void {
    this.dialogs
      .open(ConfirmDialogComponent, {
        data: {
          title: this.transloco.translate('ai.keys.revokeConfirm'),
          message: `${name}\n\n${this.transloco.translate('ai.keys.revokeBody')}`,
          confirmLabel: this.transloco.translate('ai.keys.revoke'),
          danger: true,
        },
      })
      .closed.subscribe((ok) => {
        if (ok !== true) return;
        this.busy.set(keyId);
        void this.act
          .mutateAsync(() => revokeAiKey(keyId))
          .then(() => {
            this.toasts.show(this.transloco.translate('ai.keys.revoked'), 'success');
          })
          .catch(() => {
            this.toasts.show(this.transloco.translate('ai.keys.failed'), 'error');
          })
          .finally(() => {
            this.busy.set(null);
          });
      });
  }

  protected daysLeft(iso: string): number {
    return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));
  }
}
