import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { ButtonDirective, DialogShellComponent, EmptyStateComponent } from '@naucto/ui';

export interface LinkProjectDialogData {
  /** Projects this key does not reach yet. */
  options: { id: number; name: string }[];
}

export interface LinkProjectResult {
  projectId: number;
}

/**
 * Picks which project a key may reach. Linking is the only thing that widens a key's power, so it
 * is a deliberate choice of one project rather than a default.
 */
@Component({
  selector: 'nc-link-project-dialog',
  imports: [TranslocoDirective, ButtonDirective, DialogShellComponent, EmptyStateComponent],
  template: `
    <nc-dialog-shell
      *transloco="let t"
      [title]="t('ai.keys.addProject')"
      [lead]="t('ai.keys.projectsHint')"
    >
      @if (!data.options.length) {
        <nc-empty-state icon="folder" [title]="t('ai.keys.projectsNone')" />
      } @else {
        <ul class="max-h-64 space-y-0.5 overflow-auto">
          @for (project of data.options; track project.id) {
            <li>
              <button
                ncButton
                variant="ghost"
                size="sm"
                class="w-full justify-start"
                [disabled]="chosen() !== null && chosen() !== project.id"
                (click)="choose(project.id)"
              >
                {{ project.name }}
              </button>
            </li>
          }
        </ul>
      }
      <ng-container footer>
        <button ncButton variant="ghost" (click)="ref.close()">
          {{ t('net.cancel') }}
        </button>
        <button ncButton variant="primary" [disabled]="chosen() === null" (click)="confirm()">
          {{ t('ai.keys.addProject') }}
        </button>
      </ng-container>
    </nc-dialog-shell>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LinkProjectDialog {
  protected readonly data = inject<LinkProjectDialogData>(DIALOG_DATA);
  protected readonly ref = inject(DialogRef<LinkProjectResult | undefined>);
  protected readonly chosen = signal<number | null>(null);

  protected choose(id: number): void {
    this.chosen.set(id);
  }

  protected confirm(): void {
    const projectId = this.chosen();
    if (projectId === null) return;
    this.ref.close({ projectId });
  }
}
