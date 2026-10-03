import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { type CheckpointLimitDto } from '@naucto/api-client';
import {
  ButtonDirective,
  DialogShellComponent,
  FieldComponent,
  InputDirective,
  NoticeComponent,
  ToastService,
} from '@naucto/ui';

import { ApiError } from '../../../core/api/api-errors';
import {
  injectProjectCheckpoints,
  injectProjectLimits,
} from '../../../shared/queries/projects.queries';
import type { SessionSaveService } from '../work-session/session-save.service';

export interface SaveVersionDialogData {
  projectId: number;
  saves: SessionSaveService;
}

/**
 * Name the current state as a version. The count, the cap and what reusing a name does are stated
 * before the button.
 */
@Component({
  selector: 'nc-save-version-dialog',
  imports: [
    TranslocoDirective,
    ButtonDirective,
    DialogShellComponent,
    FieldComponent,
    InputDirective,
    NoticeComponent,
  ],
  templateUrl: './save-version.dialog.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SaveVersionDialog {
  protected readonly data = inject<SaveVersionDialogData>(DIALOG_DATA);
  protected readonly ref = inject<DialogRef<boolean>>(DialogRef);
  private readonly toasts = inject(ToastService);
  private readonly transloco = inject(TranslocoService);
  protected readonly nameMax = 32;

  protected readonly name = signal('');
  protected readonly saving = signal(false);
  private readonly checkpoints = injectProjectCheckpoints(() => this.data.projectId);
  private readonly limits = injectProjectLimits();
  protected readonly releases = computed(() => this.checkpoints.data() ?? []);
  /** Named versions a project may hold, once the server has said; it has the last word anyway. */
  protected readonly maxVersions = computed(() => this.limits.data()?.maxCheckpoints);
  protected readonly atCap = computed(() => {
    const max = this.maxVersions();
    return max !== undefined && this.releases().length >= max;
  });
  protected readonly overwriting = computed(() => {
    const name = this.name().trim();
    return this.releases().some((release) => release.name === name);
  });
  protected readonly canSave = computed(
    () => !!this.name().trim() && !this.saving() && (!this.atCap() || this.overwriting()),
  );

  protected async submit(): Promise<void> {
    if (!this.canSave()) {
      return;
    }
    const saves = this.data.saves;
    const name = this.name().trim();
    this.saving.set(true);
    try {
      if (saves.dirty()) {
        await saves.save({ force: true });
      }
      await saves.saveCheckpoint(name);
      this.toasts.show(this.transloco.translate('editor.game.versionSaved', { name }), 'success');
      this.ref.close(true);
    } catch (error) {
      // The server's count, not the list's: the list may be behind the save that filled it.
      const limit =
        error instanceof ApiError && error.code === 'CHECKPOINT_LIMIT'
          ? (error.body as CheckpointLimitDto)
          : null;
      this.toasts.show(
        limit
          ? this.transloco.translate('editor.game.versionLimit', {
              count: limit.count,
              max: limit.max,
            })
          : this.transloco.translate('editor.game.versionSaveFailed'),
        'error',
      );
    } finally {
      this.saving.set(false);
    }
  }
}
