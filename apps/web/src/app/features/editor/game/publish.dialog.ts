import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { unwrap } from '@app/core/api/api-errors';
import { invalidateProjectHistory } from '@app/shared/queries/projects.queries';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import {
  projectControllerPublish,
  projectControllerSaveCheckpoint,
  projectControllerUnpublish,
  projectControllerUpdateRelease,
} from '@naucto/api-client';
import { computeSizeReport } from '@naucto/engine';
import {
  ButtonDirective,
  DialogShellComponent,
  IconComponent,
  type IconName,
  MeterComponent,
  NoticeComponent,
} from '@naucto/ui';
import { QueryClient } from '@tanstack/angular-query-experimental';
import * as Y from 'yjs';

import type { WorkSessionService } from '../work-session/work-session.service';

export const PUBLISH_CEILING = 1024 * 1024;

/** What the history calls the version that is on the hub. */
export const PUBLISHED_VERSION = 'published';

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
  template: `
    <nc-dialog-shell
      *transloco="let t"
      [title]="t('editor.publishDialog.title')"
      [lead]="t('editor.publishDialog.lead')"
    >
      <!-- What a release lets people do, one line each, with the mark the hub shows it under. -->
      <ul class="grid gap-0.75 text-body leading-[1.65] text-ink-body">
        @for (line of lines; track line.icon) {
          <li class="flex items-start gap-1">
            <nc-icon [name]="line.icon" [size]="12" class="mt-[3px] shrink-0 text-ink-3" />
            <span>{{ t('editor.publishDialog.' + line.key) }}</span>
          </li>
        }
      </ul>
      <div class="mt-2 border-t border-line pt-1.5">
        <div class="mb-1 flex justify-between">
          <span class="label">{{ t('editor.publishDialog.size') }}</span>
          <span class="font-mono text-label text-ink">{{ kb(size().total) }} / 1 MB</span>
        </div>
        <nc-meter
          size="md"
          [segments]="segments()"
          [max]="ceiling"
          [label]="t('editor.publishDialog.size')"
        />
      </div>
      @if (size().total > ceiling) {
        <nc-notice tone="danger" class="mt-1">
          {{ t('editor.publishDialog.over', { by: kb(size().total - ceiling) }) }}
        </nc-notice>
      }
      @if (error()) {
        <nc-notice tone="danger" class="mt-1">{{ error() }}</nc-notice>
      }
      <ng-container footer>
        @if (data.session.project()?.publishedAt) {
          <button ncButton variant="danger" (click)="unpublish()" [disabled]="busy()">
            {{ t('editor.publishDialog.unpublish') }}
          </button>
          <button
            ncButton
            variant="primary"
            (click)="publish(true)"
            [disabled]="busy() || size().total > ceiling"
          >
            {{ t('editor.publishDialog.update') }}
          </button>
        } @else {
          <button ncButton variant="ghost" (click)="ref.close(false)">
            {{ t('editor.publishDialog.notYet') }}
          </button>
          <button
            ncButton
            variant="primary"
            (click)="publish(false)"
            [disabled]="busy() || size().total > ceiling"
          >
            {{ t('editor.publishDialog.publish') }}
          </button>
        }
      </ng-container>
    </nc-dialog-shell>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublishDialogComponent {
  protected readonly data = inject<{ session: WorkSessionService }>(DIALOG_DATA);
  protected readonly ref = inject<DialogRef<boolean>>(DialogRef);
  private readonly qc = inject(QueryClient);
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
  protected readonly segments = computed(() => {
    const s = this.size();
    return [
      { label: `Sprites ${this.kb(s.sprites)}`, value: s.sprites, color: 'bg-sky' },
      { label: `Music ${this.kb(s.sound)}`, value: s.sound, color: 'bg-blush' },
      { label: `Map ${this.kb(s.map)}`, value: s.map, color: 'bg-jade' },
      { label: `Code ${this.kb(s.code)}`, value: s.code, color: 'bg-gold' },
    ];
  });

  protected kb(n: number): string {
    return n >= 1024 * 1024
      ? `${(n / 1024 / 1024).toFixed(2)} MB`
      : `${String(Math.round(n / 1024))} KB`;
  }

  /**
   * Publishing leaves a named version behind.
   *
   * What is on the hub is otherwise nowhere in the history: the panel would show a run of
   * autosaves and a date in another panel, and no way to go back to the state people are playing.
   * The name is written once and rewritten on each release, so the history carries the version
   * that is live and not one per attempt.
   */
  private async markPublished(id: string): Promise<void> {
    await projectControllerSaveCheckpoint({
      path: { id, name: PUBLISHED_VERSION },
      body: {
        file: new Blob([Y.encodeStateAsUpdate(this.data.session.doc) as BlobPart], {
          type: 'application/octet-stream',
        }),
      },
    });
  }

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
      await this.markPublished(id);
      await invalidateProjectHistory(this.qc, this.data.session.id, 'checkpoints');
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
    try {
      unwrap(await projectControllerUnpublish({ path: { id: String(this.data.session.id) } }));
      await this.data.session.refreshProject();
      this.ref.close(false);
    } finally {
      this.busy.set(false);
    }
  }
}
