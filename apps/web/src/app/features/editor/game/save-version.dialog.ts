import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ApiError, unwrap } from '@app/core/api/api-errors';
import {
  injectProjectCheckpoints,
  injectProjectLimits,
  invalidateProjectHistory,
} from '@app/shared/queries/projects.queries';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { type CheckpointLimitDto, projectControllerSaveCheckpoint } from '@naucto/api-client';
import {
  ButtonDirective,
  DialogShellComponent,
  FieldComponent,
  InputDirective,
  NoticeComponent,
  ToastService,
} from '@naucto/ui';
import { QueryClient } from '@tanstack/angular-query-experimental';
import * as Y from 'yjs';

import type { WorkSessionService } from '../work-session/work-session.service';

export interface SaveVersionDialogData {
  session: WorkSessionService;
}

/**
 * Name the current state as a version.
 *
 * A dialog rather than a field in the panel: the panel is a list to read, and the one thing on it
 * that could refuse — the cap on named versions — had a line of small print under a field to say
 * so. Here the count, the cap and what a name already in the list does are said in full, before
 * the button.
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
  template: `
    <nc-dialog-shell
      *transloco="let t"
      [title]="t('editor.game.saveVersion')"
      [lead]="t('editor.game.saveVersionLead')"
    >
      <nc-field
        [label]="t('editor.game.versionName')"
        for="version-name"
        [hint]="
          maxVersions() !== undefined
            ? t('editor.game.versionCount', { count: releases().length, max: maxVersions() })
            : undefined
        "
      >
        <!-- The name is the whole dialog, so the caret starts in it rather than on the close. -->
        <input
          ncInput
          cdkFocusInitial
          id="version-name"
          autocomplete="off"
          spellcheck="false"
          [attr.maxlength]="nameMax"
          [value]="name()"
          (input)="name.set($any($event.target).value)"
          (keydown.enter)="submit()"
        />
      </nc-field>
      <!-- A name already in the list rewrites that version, which the cap does not count — so at
           the cap, the way to save is to reuse a name or to delete one, and both are said. -->
      @if (overwriting()) {
        <nc-notice class="mt-1">
          {{ t('editor.game.versionOverwrites', { name: name().trim() }) }}
        </nc-notice>
      } @else if (atCap()) {
        <nc-notice class="mt-1">
          {{ t('editor.game.versionLimit', { count: releases().length, max: maxVersions() }) }}
        </nc-notice>
      }
      <ng-container footer>
        <button ncButton variant="ghost" (click)="ref.close()">
          {{ t('editor.code.cancel') }}
        </button>
        <button ncButton variant="primary" [disabled]="!canSave()" (click)="submit()">
          {{ t('editor.game.saveVersionConfirm') }}
        </button>
      </ng-container>
    </nc-dialog-shell>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SaveVersionDialog {
  protected readonly data = inject<SaveVersionDialogData>(DIALOG_DATA);
  protected readonly ref = inject<DialogRef<boolean>>(DialogRef);
  private readonly qc = inject(QueryClient);
  private readonly toasts = inject(ToastService);
  private readonly transloco = inject(TranslocoService);
  protected readonly nameMax = 32;

  protected readonly name = signal('');
  protected readonly saving = signal(false);
  private readonly checkpoints = injectProjectCheckpoints(() => this.data.session.id);
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
    return this.releases().some((r) => r.name === name);
  });
  protected readonly canSave = computed(
    () => !!this.name().trim() && !this.saving() && (!this.atCap() || this.overwriting()),
  );

  /**
   * The endpoint takes the document as a file, exactly like an autosave — this sent an empty body
   * and got a 422 back every single time. Nothing surfaced it, so the toast said the version was
   * saved and the list it refreshed stayed empty.
   */
  protected async submit(): Promise<void> {
    if (!this.canSave()) return;
    const session = this.data.session;
    const name = this.name().trim();
    this.saving.set(true);
    try {
      // Only where something has been written since: naming the state you are already saved at is
      // exactly what somebody marking a milestone is doing, and refusing it there sent them off to
      // make a pointless edit first.
      if (session.dirty()) await session.save({ force: true });
      unwrap(
        await projectControllerSaveCheckpoint({
          path: { id: String(session.id), name },
          body: {
            file: new Blob([Y.encodeStateAsUpdate(session.doc) as BlobPart], {
              type: 'application/octet-stream',
            }),
          },
        }),
      );
      await invalidateProjectHistory(this.qc, session.id, 'checkpoints');
      this.toasts.show(this.transloco.translate('editor.game.versionSaved', { name }), 'success');
      this.ref.close(true);
    } catch (e) {
      // The server's count, not the list's: the list may be behind the save that filled it.
      const limit =
        e instanceof ApiError && e.code === 'CHECKPOINT_LIMIT'
          ? (e.body as CheckpointLimitDto)
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
