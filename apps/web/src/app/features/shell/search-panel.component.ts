import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import {
  AvatarComponent,
  ButtonDirective,
  ChipComponent,
  HighlightComponent,
  KeycapComponent,
  MarkComponent,
  StatComponent,
  SuggestPanelComponent,
  SuggestRowComponent,
} from '@naucto/ui';

import { PresenceStore } from '../../core/presence/presence.store';
import { type PresenceLine, presenceLine } from '../../core/presence/presence-line';
import { DiskNameComponent } from '../../shared/game-card/disk-name.component';
import { diskStyleFor } from '../../shared/game-card/disk-style';
import { FloppyComponent } from '../../shared/game-card/floppy.component';
import type { ParsedTerm, PersonHit, Suggestions } from '../../shared/queries/search.queries';
import { UserAvatarComponent } from '../../shared/user-avatar.component';

/** Where an option leads, which is all the box needs to know about it. */
export type SuggestTarget =
  | { kind: 'game'; id: number }
  | { kind: 'person'; username: string }
  | { kind: 'session'; projectId: number; sessionUuid: string }
  | { kind: 'tag'; tag: string };

/** Past this many, a session's seats are counted in a chip instead of drawn one by one. */
const SEATS_DRAWN = 8;

/**
 * What the search box offers, grouped by kind: games as disks, people, open sessions, tags. Each
 * option takes the focus itself, and the box that owns the panel moves it; a choice is `picked`.
 */
@Component({
  selector: 'nc-search-panel',
  imports: [
    TranslocoDirective,
    AvatarComponent,
    ButtonDirective,
    ChipComponent,
    HighlightComponent,
    KeycapComponent,
    MarkComponent,
    StatComponent,
    SuggestPanelComponent,
    SuggestRowComponent,
    DiskNameComponent,
    FloppyComponent,
    UserAvatarComponent,
  ],
  templateUrl: './search-panel.component.html',
  host: { class: 'contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchPanelComponent {
  readonly suggestions = input.required<Suggestions>();
  readonly parsed = input.required<ParsedTerm>();
  /** The option the caret is on, counted in the order they are drawn; -1 for none. */
  readonly cursor = input(-1);
  readonly listId = input.required<string>();
  /** Nothing was found, as opposed to nothing having answered yet. */
  readonly empty = input(false);
  readonly picked = output<SuggestTarget>();

  private readonly presence = inject(PresenceStore);

  protected readonly heading =
    'px-[8px] pt-[12px] pb-[6px] font-ui text-micro tracking-label text-ink-4 uppercase';

  protected readonly games = computed(() =>
    this.suggestions().games.map((game) => ({ game, disk: diskStyleFor(game) })),
  );

  protected readonly sessions = computed(() =>
    this.suggestions().sessions.map((session) => ({
      session,
      host: session.hostNickname ?? session.hostUsername,
      disk: diskStyleFor({ id: session.projectId }),
      seats:
        session.maxPlayers <= SEATS_DRAWN
          ? Array.from({ length: session.maxPlayers }, (_, seat) => seat < session.playerCount)
          : null,
    })),
  );

  /** Where each group after the games starts among every option drawn. */
  protected readonly offsets = computed(() => {
    const { games, people, sessions } = this.suggestions();
    return {
      people: games.length,
      sessions: games.length + people.length,
      tags: games.length + people.length + sessions.length,
    };
  });

  /** What a person is doing, when we are told — presence only reaches us for friends. */
  protected presenceOf(person: PersonHit): PresenceLine | null {
    return presenceLine(this.presence.of(person.id));
  }
}
