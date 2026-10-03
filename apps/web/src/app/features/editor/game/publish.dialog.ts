import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { unwrap } from '@app/core/api/api-errors';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import {
  projectControllerPublish,
  projectControllerUnpublish,
  projectControllerUpdateRelease,
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

import type { WorkSessionService } from '../work-session/work-session.service';

export const PUBLISH_CEILING = 1024 * 1024;

/** What the history calls the version that is on the hub. */
const PUBLISHED_VERSION = 'published';

export function sizeSegments(s: SizeReport): { label: string; value: number; color: string }[] {
  return [
    { label: `Sprites ${formatBytes(s.sprites)}`, value: s.sprites, color: 'bg-sky' },
    { label: `Music ${formatBytes(s.sound)}`, value: s.sound, color: 'bg-blush' },
    { label: `Map ${formatBytes(s.map)}`, value: s.map, color: 'bg-jade' },
    { label: `Code ${formatBytes(s.code)}`, value: s.code, color: 'bg-gold' },
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
  protected readonly data = inject<{ session: WorkSessionService }>(DIALOG_DATA);
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
      await this.data.session.save({ force: true });
      const id = String(this.data.session.id);
      unwrap(
        update
          ? await projectControllerUpdateRelease({ path: { id } })
          : await projectControllerPublish({ path: { id } }),
      );
      // After the release, not before: a version named for something that did not happen is worse
      // than no version at all.
      await this.data.session.saveCheckpoint(PUBLISHED_VERSION);
      await this.data.session.refreshProject();
      this.ref.close(true);
    } catch (e) {
      this.error.set(
        e instanceof Error ? e.message : this.transloco.translate('editor.publishDialog.failed'),
      );
    } finally {
      this.busy.set(false);
    }
  }

  protected async unpublish(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      unwrap(await projectControllerUnpublish({ path: { id: String(this.data.session.id) } }));
      await this.data.session.refreshProject();
      this.ref.close(false);
    } catch (e) {
      this.error.set(
        e instanceof Error ? e.message : this.transloco.translate('editor.publishDialog.failed'),
      );
    } finally {
      this.busy.set(false);
    }
  }
}
