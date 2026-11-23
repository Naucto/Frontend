import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import type { ModerationActionType, StandingEntryDto } from '@naucto/api-client';
import {
  ChipComponent,
  type ChipTone,
  NoticeComponent,
  PagerComponent,
  SkeletonComponent,
  TableDirective,
} from '@naucto/ui';

import { injectStanding, STANDING_PAGE_SIZE } from '../../shared/queries/moderation.queries';

/** What each decision reads as to the account it landed on. Any other gets the general wording. */
const KNOWN: readonly ModerationActionType[] = [
  'ACCOUNT_WARNED',
  'ACCOUNT_SUSPENDED',
  'ACCOUNT_REINSTATED',
  'PROFILE_CLEARED',
  'PROJECT_HIDDEN',
  'PROJECT_RESTORED',
  'PROJECT_DELETED',
  'COMMENT_HIDDEN',
  'COMMENT_RESTORED',
  'COMMENT_DELETED',
];

const LIFTED: readonly ModerationActionType[] = [
  'ACCOUNT_REINSTATED',
  'PROJECT_RESTORED',
  'COMMENT_RESTORED',
];

/**
 * What moderation decided about the signed-in account and what it made: the suspension it is
 * under, its warnings, and each decision with the reason and the message staff gave.
 */
@Component({
  selector: 'nc-standing-settings',
  imports: [
    DatePipe,
    TranslocoDirective,
    ChipComponent,
    NoticeComponent,
    PagerComponent,
    SkeletonComponent,
    TableDirective,
  ],
  templateUrl: './standing-settings.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StandingSettingsComponent {
  protected readonly WHEN = 'MMM d, y, h:mm a';
  protected readonly page = signal(1);
  protected readonly standing = injectStanding(() => this.page());
  protected readonly pages = computed(() =>
    Math.max(1, Math.ceil((this.standing.data()?.total ?? 0) / STANDING_PAGE_SIZE)),
  );

  protected actionKey(entry: StandingEntryDto): string {
    return `moderation.standing.actions.${KNOWN.includes(entry.action) ? entry.action : 'OTHER'}`;
  }

  /** A decision lifted reads as good news, a warning as a warning, anything else as a sanction. */
  protected tone(entry: StandingEntryDto): ChipTone {
    if (LIFTED.includes(entry.action)) {
      return 'jade';
    }
    return entry.action === 'ACCOUNT_WARNED' ? 'orange' : 'hot';
  }
}
