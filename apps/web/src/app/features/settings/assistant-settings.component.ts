import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { unwrap } from '@app/core/api/api-errors';
import {
  grantAiKeyProject,
  injectAiKeys,
  invalidateAiKeys,
  revokeAiKey,
  ungrantAiKeyProject,
} from '@app/shared/queries/ai-keys.queries';
import { qk } from '@app/shared/queries/query-keys';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { projectControllerFindAll, type ProjectExResponseDto } from '@naucto/api-client';
import {
  ButtonDirective,
  ConfirmDialogComponent,
  DialogService,
  EmptyStateComponent,
  ErrorStateComponent,
  SkeletonComponent,
  ToastService,
} from '@naucto/ui';
import { injectMutation, injectQuery, QueryClient } from '@tanstack/angular-query-experimental';

import { CreateAiKeyDialog } from './create-ai-key.dialog';
import { LinkProjectDialog, type LinkProjectResult } from './link-project.dialog';

/**
 * The account's assistant keys: what they are, which projects each may reach, and the two calls
 * that matter — link a project, or revoke the key everywhere.
 *
 * A key reaches only the projects listed against it, so linking is the whole of its power and
 * unlinking takes that power back without destroying the key.
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
              <div class="mt-1 flex flex-wrap items-center gap-1">
                <span class="label text-ink-4">{{ t('ai.keys.projects') }}</span>
                @for (project of key.projects; track project.projectId) {
                  <span class="flex items-center gap-0.5 border border-line px-1 py-0.5">
                    <span class="text-meta text-ink-body">{{ project.name }}</span>
                    <button
                      ncButton
                      variant="ghost"
                      size="xs"
                      iconOnly
                      [attr.aria-label]="t('ai.keys.unlink') + ' ' + project.name"
                      [disabled]="busy() === key.id"
                      (click)="unlink(key.id, project.projectId)"
                    >
                      ×
                    </button>
                  </span>
                } @empty {
                  <span class="text-meta text-ink-3">{{ t('ai.keys.projectsNone') }}</span>
                }
                @if (linkable(key).length) {
                  <button
                    ncButton
                    variant="secondary"
                    size="xs"
                    [disabled]="busy() === key.id"
                    (click)="link(key.id, linkable(key))"
                  >
                    {{ t('ai.keys.addProject') }}
                  </button>
                }
              </div>
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

  private readonly myProjects = injectQuery(() => ({
    queryKey: qk.myProjects({ page: 1, limit: 100 }),
    queryFn: async () => unwrap(await projectControllerFindAll({ query: { page: 1, limit: 100 } })),
  }));

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

  /** Projects this key does not reach yet. Linking one is the only way to widen it. */
  protected linkable(key: {
    id: string;
    projects: { projectId: number }[];
  }): ProjectExResponseDto[] {
    const taken = new Set(key.projects.map((p) => p.projectId));
    return (this.myProjects.data()?.projects ?? []).filter((p) => !taken.has(p.id));
  }

  protected link(keyId: string, options: ProjectExResponseDto[]): void {
    this.dialogs
      .open<
        LinkProjectDialog,
        { options: { id: number; name: string }[] },
        LinkProjectResult | undefined
      >(LinkProjectDialog, { data: { options: options.map((o) => ({ id: o.id, name: o.name })) } })
      .closed.subscribe((picked) => {
        if (!picked) return;
        this.busy.set(keyId);
        void this.act
          .mutateAsync(() => grantAiKeyProject(keyId, picked.projectId))
          .then(() => {
            this.toasts.show(this.transloco.translate('ai.keys.linked'), 'success');
          })
          .catch(() => {
            this.toasts.show(this.transloco.translate('ai.keys.failed'), 'error');
          })
          .finally(() => {
            this.busy.set(null);
          });
      });
  }

  protected unlink(keyId: string, projectId: number): void {
    this.busy.set(keyId);
    void this.act
      .mutateAsync(() => ungrantAiKeyProject(keyId, projectId))
      .then(() => {
        this.toasts.show(this.transloco.translate('ai.keys.unlinked'), 'success');
      })
      .catch(() => {
        this.toasts.show(this.transloco.translate('ai.keys.failed'), 'error');
      })
      .finally(() => {
        this.busy.set(null);
      });
  }

  protected daysLeft(iso: string): number {
    return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));
  }
}
