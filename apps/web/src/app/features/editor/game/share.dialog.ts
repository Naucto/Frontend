import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { unwrap } from '@app/core/api/api-errors';
import {
  projectControllerAddCollaborator,
  projectControllerRemoveCollaborator,
} from '@naucto/api-client';
import {
  AvatarComponent,
  ButtonDirective,
  DialogShellComponent,
  FieldComponent,
  InputDirective,
  ToastService,
} from '@naucto/ui';

import type { WorkSessionService } from '../work-session/work-session.service';

export async function addCollaborator(projectId: number, handle: string): Promise<void> {
  const body = handle.includes('@') ? { email: handle } : { username: handle };
  unwrap(await projectControllerAddCollaborator({ path: { id: projectId }, body }));
}

/** SHARE: collaborators list + invite by username or email. */
@Component({
  selector: 'nc-share-dialog',
  imports: [
    FormsModule,
    AvatarComponent,
    ButtonDirective,
    DialogShellComponent,
    FieldComponent,
    InputDirective,
  ],
  template: `
    <nc-dialog-shell title="Share">
      <p class="mb-2 text-body text-ink-2">
        Collaborators can edit everything in real time. Only the creator can publish.
      </p>
      <ul class="mb-2 divide-y divide-line">
        @for (c of data.session.collaborators(); track c.clientId) {
          <li class="flex items-center gap-1 py-1">
            <nc-avatar [name]="c.name" [colour]="c.colour" [size]="24" />
            <span class="text-ui text-ink">{{ c.name }}</span>
            <span class="flex-1"></span>
            @if (!c.isSelf && data.session.isHost()) {
              <button ncButton variant="ghost" size="sm" (click)="remove(c.userId)">Remove</button>
            }
          </li>
        } @empty {
          <li class="py-1 text-meta text-ink-3">Just you so far.</li>
        }
      </ul>
      <form class="flex items-end gap-1" (ngSubmit)="invite()">
        <nc-field label="Invite by username or email" for="share-handle" class="flex-1">
          <input
            ncInput
            id="share-handle"
            name="handle"
            [(ngModel)]="handle"
            placeholder="louis or louis@naucto.dev"
          />
        </nc-field>
        <button ncButton variant="primary" type="submit" [disabled]="!handle.trim() || busy()">
          Invite
        </button>
      </form>
      <ng-container footer>
        <button ncButton variant="ghost" (click)="ref.close()">Done</button>
      </ng-container>
    </nc-dialog-shell>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShareDialogComponent {
  protected readonly data = inject<{ session: WorkSessionService }>(DIALOG_DATA);
  protected readonly ref = inject(DialogRef);
  private readonly toasts = inject(ToastService);
  protected handle = '';
  protected readonly busy = signal(false);

  protected async invite(): Promise<void> {
    this.busy.set(true);
    try {
      await addCollaborator(this.data.session.id, this.handle.trim());
      await this.data.session.refreshProject();
      this.toasts.show(`Invited ${this.handle}`, 'success');
      this.handle = '';
    } catch {
      this.toasts.show('Could not invite that person', 'error');
    } finally {
      this.busy.set(false);
    }
  }

  protected async remove(userId: number): Promise<void> {
    await projectControllerRemoveCollaborator({
      path: { id: this.data.session.id },
      body: { userId },
    });
    await this.data.session.refreshProject();
  }
}
