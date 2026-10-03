import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import {
  projectContentControllerPublish,
  projectContentControllerUnpublish,
  projectContentControllerUpdateRelease,
} from '@naucto/api-client';
import { computeSizeReport, type SizeReport } from '@naucto/engine';
import {
  ButtonDirective,
  DialogShellComponent,
  formatBytes,
  IconComponent,
  type IconName,
  MeterComponent,
  NoticeComponent,
} from '@naucto/ui';

import { unwrap } from '../../../core/api/api-errors';
import type { SessionSaveService } from '../work-session/session-save.service';
import type { WorkSessionService } from '../work-session/work-session.service';

export const PUBLISH_CEILING = 1024 * 1024;

/** What the history calls the version that is on the hub. */
const PUBLISHED_VERSION = 'published';

export function sizeSegments(
  report: SizeReport,
): { label: string; value: number; color: string }[] {
  return [
    { label: `Sprites ${formatBytes(report.sprites)}`, value: report.sprites, color: 'bg-sky' },
    { label: `Music ${formatBytes(report.sound)}`, value: report.sound, color: 'bg-blush' },
    { label: `Map ${formatBytes(report.map)}`, value: report.map, color: 'bg-jade' },
    { label: `Code ${formatBytes(report.code)}`, value: report.code, color: 'bg-gold' },
  ];
}

/** PUBLISH: save, then publish / update the release / unpublish, with the size budget in view. */
@Component({
  selector: 'nc-publish-dialog',
  imports: [
    TranslocoDirective,
    ButtonDirective,
    DialogShellComponent,
    IconComponent,
    MeterComponent,
    NoticeComponent,
  ],
  templateUrl: './publish.dialog.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublishDialogComponent {
  protected readonly data = inject<{
    session: WorkSessionService;
    saves: SessionSaveService;
  }>(DIALOG_DATA);
  protected readonly ref = inject<DialogRef<boolean>>(DialogRef);
  private readonly transloco = inject(TranslocoService);
  protected readonly ceiling = PUBLISH_CEILING;
  protected readonly lines: readonly { icon: IconName; key: string }[] = [
    { icon: 'play', key: 'play' },
    { icon: 'heart', key: 'like' },
    { icon: 'git-branch', key: 'remix' },
  ];
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly size = computed(() => computeSizeReport(this.data.session.game));
  protected readonly segments = computed(() => sizeSegments(this.size()));
  protected readonly kb = formatBytes;

  protected async publish(update: boolean): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.data.saves.save({ force: true });
      const id = String(this.data.session.id);
      unwrap(
        update
          ? await projectContentControllerUpdateRelease({ path: { id } })
          : await projectContentControllerPublish({ path: { id } }),
      );
      // After the release, not before: a version named for something that did not happen is worse
      // than no version at all.
      await this.data.saves.saveCheckpoint(PUBLISHED_VERSION);
      await this.data.saves.refreshProject();
      this.ref.close(true);
    } catch (error) {
      this.error.set(
        error instanceof Error
          ? error.message
          : this.transloco.translate('editor.publishDialog.failed'),
      );
    } finally {
      this.busy.set(false);
    }
  }

  protected async unpublish(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      unwrap(
        await projectContentControllerUnpublish({ path: { id: String(this.data.session.id) } }),
      );
      await this.data.saves.refreshProject();
      this.ref.close(false);
    } catch (error) {
      this.error.set(
        error instanceof Error
          ? error.message
          : this.transloco.translate('editor.publishDialog.failed'),
      );
    } finally {
      this.busy.set(false);
    }
  }
}
