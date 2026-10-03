import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { unwrap } from '@app/core/api/api-errors';
import { PersonSearchComponent } from '@app/shared/person-search.component';
import type { PersonHit } from '@app/shared/queries/search.queries';
import { UserAvatarComponent } from '@app/shared/user-avatar.component';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import {
  projectControllerAddCollaborator,
  projectControllerRemoveCollaborator,
} from '@naucto/api-client';
import {
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
    UserAvatarComponent,
    ButtonDirective,
    DialogShellComponent,
    OnlineDotComponent,
    PersonSearchComponent,
  ],
  templateUrl: './share.dialog.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShareDialogComponent {
  protected readonly data = inject<{ session: WorkSessionService }>(DIALOG_DATA);
  protected readonly ref = inject(DialogRef);
  private readonly toasts = inject(ToastService);
  private readonly transloco = inject(TranslocoService);

  /** The project's collaborators, whether or not they are connected to the session right now. */
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
      this.toasts.show(
        this.transloco.translate('share.invited', { name: person.username }),
        'success',
      );
    } catch (e: unknown) {
      // The server's own message tells the refusals apart.
      this.toasts.show(
        e instanceof Error ? e.message : this.transloco.translate('share.inviteFailed'),
        'error',
      );
    }
  }

  protected async remove(person: { id: number; username: string }): Promise<void> {
    try {
      unwrap(
        await projectControllerRemoveCollaborator({
          path: { id: this.data.session.id },
          body: { userId: person.id },
        }),
      );
      await this.data.session.refreshProject();
      this.toasts.show(
        this.transloco.translate('share.removed', { name: person.username }),
        'success',
      );
    } catch (e: unknown) {
      this.toasts.show(
        e instanceof Error ? e.message : this.transloco.translate('share.removeFailed'),
        'error',
      );
    }
  }
}
