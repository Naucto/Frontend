import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  numberAttribute,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { openGame } from '@naucto/engine';
import {
  ButtonDirective,
  ChipComponent,
  ErrorStateComponent,
  NoticeComponent,
  SegmentedComponent,
  SkeletonComponent,
} from '@naucto/ui';
import { injectQuery } from '@tanstack/angular-query-experimental';

import { GameScreenComponent } from '../../shared/game-screen/game-screen.component';
import {
  type PreviewSource,
  StaffPreviewService,
} from '../../shared/moderation/staff-preview.service';
import { qk } from '../../shared/queries/query-keys';

/**
 * A game as staff play it to review it, published or not, hidden or not. It runs and nothing
 * else: no like, no comment, no remix, no play counted, no session to host or join, which is what
 * the screen's null `projectId` turns off.
 */
@Component({
  selector: 'nc-staff-play-page',
  imports: [
    RouterLink,
    TranslocoDirective,
    ButtonDirective,
    ChipComponent,
    ErrorStateComponent,
    NoticeComponent,
    SegmentedComponent,
    SkeletonComponent,
    GameScreenComponent,
  ],
  templateUrl: './staff-play.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class StaffPlayPage {
  private readonly previews = inject(StaffPreviewService);
  private readonly transloco = inject(TranslocoService);

  /** The `:id` of the route. */
  readonly id = input.required({ transform: numberAttribute });

  /** Chosen by hand. Until then the page shows the latest save, which is what an author can change. */
  private readonly chosen = signal<PreviewSource | null>(null);
  protected readonly source = computed<PreviewSource>(() => this.chosen() ?? 'draft');

  protected readonly project = injectQuery(() => ({
    queryKey: qk.staffPreview(this.id()),
    queryFn: () => this.previews.project(this.id()),
    retry: false,
  }));

  /** Never kept: a preview is read when it is looked at, and each read is the one the log shows. */
  protected readonly game = injectQuery(() => ({
    queryKey: qk.staffPreviewContent(this.id(), this.source()),
    queryFn: async () => {
      const bytes = await this.previews.content(this.id(), this.source());
      return bytes ? openGame(bytes) : null;
    },
    retry: false,
    gcTime: 0,
    staleTime: Infinity,
  }));

  protected readonly sources = computed<{ value: PreviewSource; label: string }[]>(() => [
    { value: 'draft', label: this.transloco.translate('moderation.preview.draft') },
    { value: 'release', label: this.transloco.translate('moderation.preview.release') },
  ]);

  protected choose(source: PreviewSource | undefined): void {
    if (source) {
      this.chosen.set(source);
    }
  }

  protected retry(): void {
    void this.project.refetch();
    void this.game.refetch();
  }
}
