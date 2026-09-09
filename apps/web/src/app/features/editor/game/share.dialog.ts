import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { unwrap } from '@app/core/api/api-errors';
import { PersonSearchComponent } from '@app/shared/person-search.component';
import type { PersonHit } from '@app/shared/queries/search.queries';
import { TranslocoDirective } from '@jsverse/transloco';
import {
  projectControllerAddCollaborator,
  projectControllerRemoveCollaborator,
} from '@naucto/api-client';
import {
  AvatarComponent,
  ButtonDirective,
  DialogShellComponent,
  OnlineDotComponent,
  ToastService,
} from '@naucto/ui';

import type { WorkSessionService } from '../work-session/work-session.service';

export async function addCollaborator(projectId: number, handle: string): Promise<void> {
  const body = handle.includes('@') ? { email: handle } : { username: handle };
  unwrap(await projectControllerAddCollaborator({ path: { id: projectId }, body }));
}

/** SHARE: who the project belongs to, and adding somebody to it. */
@Component({
  selector: 'nc-share-dialog',
  imports: [
    TranslocoDirective,
    AvatarComponent,
    ButtonDirective,
    DialogShellComponent,
    OnlineDotComponent,
    PersonSearchComponent,
  ],
  template: `
    <nc-dialog-shell *transloco="let t" [title]="t('share.title')">
      <p class="mb-2 text-body text-ink-2">{{ t('share.blurb') }}</p>
      <ul class="mb-2 divide-y divide-line">
        @for (c of people(); track c.id) {
          <li class="flex items-center gap-1 py-1">
            <nc-avatar [name]="c.username" [id]="c.id" [size]="24" />
            <span class="text-ui text-ink">{{ c.username }}</span>
            @if (c.isCreator) {
              <span class="label text-gold-ink">{{ t('share.creator') }}</span>
            }
            @if (c.here) {
              <nc-online-dot [online]="true" />
            }
            <span class="flex-1"></span>
            @if (!c.isCreator && isCreator()) {
              <button ncButton variant="ghost" size="sm" (click)="remove(c.id)">
                {{ t('share.remove') }}
              </button>
            }
          </li>
        } @empty {
          <li class="py-1 text-meta text-ink-3">{{ t('share.justYou') }}</li>
        }
      </ul>
      @if (isCreator()) {
        <nc-person-search
          size="md"
          [placeholder]="t('share.invite')"
          [exclude]="memberIds()"
          (picked)="invite($event)"
        />
      } @else {
        <p class="text-meta text-ink-3">{{ t('share.creatorOnly') }}</p>
      }
      <ng-container footer>
        <button ncButton variant="ghost" (click)="ref.close()">{{ t('share.done') }}</button>
      </ng-container>
    </nc-dialog-shell>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShareDialogComponent {
  protected readonly data = inject<{ session: WorkSessionService }>(DIALOG_DATA);
  protected readonly ref = inject(DialogRef);
  private readonly toasts = inject(ToastService);

  /**
   * The project's collaborators, not the session's.
   *
   * This listed the awareness states, which is who is connected right now -- so somebody invited
   * an hour ago and not currently in the editor was simply absent from the list of people the
   * project belongs to, and inviting them again answered "already a collaborator".
   */
  protected readonly people = computed(() => {
    const project = this.data.session.project();
    if (!project) return [];
    const here = new Set(this.data.session.collaborators().map((c) => c.userId));
    return project.collaborators.map((c) => ({
      id: c.id,
      username: c.username,
      isCreator: c.id === project.creator.id,
      here: here.has(c.id),
    }));
  });

  protected readonly memberIds = computed(() => this.people().map((c) => c.id));

  /** Only the creator may add or remove; the endpoint is behind a guard that says so. */
  protected readonly isCreator = computed(
    () => this.data.session.project()?.creator.id === this.data.session.myUserId,
  );

  protected async invite(person: PersonHit): Promise<void> {
    try {
      await addCollaborator(this.data.session.id, person.username);
      await this.data.session.refreshProject();
      this.toasts.show(`Invited ${person.username}`, 'success');
    } catch (e: unknown) {
      // The server distinguishes no such user from already a collaborator from not your project,
      // and one generic sentence made all three read as the same mystery.
      this.toasts.show(e instanceof Error ? e.message : 'Could not invite that person', 'error');
    }
  }

  protected async remove(userId: number): Promise<void> {
    try {
      unwrap(
        await projectControllerRemoveCollaborator({
          path: { id: this.data.session.id },
          body: { userId },
        }),
      );
      await this.data.session.refreshProject();
    } catch (e: unknown) {
      this.toasts.show(e instanceof Error ? e.message : 'Could not remove that person', 'error');
    }
  }
}
