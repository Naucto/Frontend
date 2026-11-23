import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import type { ProjectExResponseDto } from '@naucto/api-client';
import { ChipComponent, type ChipTone, NoticeComponent } from '@naucto/ui';

import { UserAvatarComponent } from '../../shared/user-avatar.component';
import type { PreviewKind } from './work-session/work-session.service';

/**
 * Tells whoever only looks at a game why nothing in it can be changed. A staff member did not
 * make the game, so the band also says what it is to everyone else, withheld, unpublished or
 * published, and who made it. An owner looking at their own game is told neither.
 */
@Component({
  selector: 'nc-read-only-band',
  imports: [RouterLink, TranslocoDirective, ChipComponent, NoticeComponent, UserAvatarComponent],
  templateUrl: './read-only-band.component.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReadOnlyBandComponent {
  readonly kind = input.required<PreviewKind>();
  readonly project = input.required<ProjectExResponseDto | null>();

  protected readonly facts = computed<{
    state: string;
    tone: ChipTone;
    maker: ProjectExResponseDto['creator'];
  } | null>(() => {
    const project = this.project();
    if (this.kind() !== 'staff' || !project) {
      return null;
    }
    const maker = project.creator;
    if (project.hiddenAt) {
      return { state: 'moderation.preview.hidden', tone: 'hot', maker };
    }
    return project.publishedAt
      ? { state: 'moderation.preview.published', tone: 'jade', maker }
      : { state: 'moderation.preview.unpublished', tone: 'neutral', maker };
  });
}
