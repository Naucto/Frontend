import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import {
  AvatarComponent,
  HighlightComponent,
  SearchComponent,
  type SearchSize,
  SuggestPanelComponent,
  SuggestRowComponent,
} from '@naucto/ui';
import { injectQuery } from '@tanstack/angular-query-experimental';

import { AuthStore } from '../core/auth/auth.store';
import { injectFriends } from './queries/friends.queries';
import { qk } from './queries/query-keys';
import { type PersonHit, searchPeople } from './queries/search.queries';

/** Enough to choose from without the panel becoming a directory. */
const SHOWN = 6;

/**
 * Pick a person by name, friends first.
 *
 * Friends lead because the people you share a project with are overwhelmingly people you already
 * know, and a handle search that buries them under strangers with similar names makes the common
 * case the slow one. They are matched locally against the list already loaded, so the section
 * costs nothing and is right even while the server's answer is still in flight.
 *
 * The panel is the hub's, down to the keyboard behaviour: the reader has met it once already, and
 * it is the same act — type a few letters, pick the row that is the person you meant.
 */
@Component({
  selector: 'nc-person-search',
  imports: [
    TranslocoDirective,
    AvatarComponent,
    HighlightComponent,
    SearchComponent,
    SuggestPanelComponent,
    SuggestRowComponent,
  ],
  templateUrl: './person-search.component.html',
  host: { class: 'relative block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PersonSearchComponent {
  readonly placeholder = input('');
  readonly size = input<SearchSize>('sm');
  /** Who is already on the project, so the list does not offer somebody twice. */
  readonly exclude = input<readonly number[]>([]);
  readonly picked = output<PersonHit>();

  private readonly auth = inject(AuthStore);
  protected readonly text = signal('');
  protected readonly dismissed = signal(true);
  protected readonly term = computed(() => this.text().trim());
  protected readonly open = computed(() => !this.dismissed() && this.term().length > 0);

  protected readonly hits = injectQuery(() => ({
    queryKey: qk.searchPeople(this.term(), SHOWN),
    queryFn: (): Promise<PersonHit[]> => searchPeople(this.term(), SHOWN),
    enabled: this.term().length > 0,
    staleTime: 30_000,
  }));

  private readonly friends = injectFriends(() => this.auth.isAuthenticated());

  private readonly excluded = computed(() => {
    const out = new Set(this.exclude());
    const me = this.auth.userId();
    if (me !== null) {
      out.add(me);
    }
    return out;
  });

  protected readonly friendHits = computed(() => {
    const needle = this.term().toLowerCase();
    if (!needle) {
      return [];
    }
    const excluded = this.excluded();
    return (this.friends.data() ?? [])
      .filter(
        (friend) =>
          !excluded.has(friend.id) &&
          (friend.username.toLowerCase().includes(needle) ||
            (friend.nickname ?? '').toLowerCase().includes(needle)),
      )
      .slice(0, SHOWN)
      .map((friend): PersonHit => ({
        id: friend.id,
        username: friend.username,
        nickname: friend.nickname,
      }));
  });

  /** Whoever the server found who is not already offered above, and not already on the project. */
  protected readonly otherHits = computed(() => {
    const shown = new Set(this.friendHits().map((friend) => friend.id));
    const excluded = this.excluded();
    return (this.hits.data() ?? []).filter((hit) => !shown.has(hit.id) && !excluded.has(hit.id));
  });

  private readonly rows = computed(() => [...this.friendHits(), ...this.otherHits()]);

  protected readonly cursor = linkedSignal({ source: this.term, computation: () => 0 });

  protected onKey(event: KeyboardEvent): void {
    const count = this.rows().length;
    if (event.key === 'Escape') {
      this.dismissed.set(true);
    } else if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && this.open() && count) {
      event.preventDefault();
      this.cursor.update(
        (cursor) => (cursor + (event.key === 'ArrowDown' ? 1 : -1) + count) % count,
      );
    }
  }

  protected commit(): void {
    const hit = this.rows()[this.cursor()];
    if (this.open() && hit) {
      this.choose(hit);
    }
  }

  protected choose(hit: PersonHit): void {
    this.text.set('');
    this.dismissed.set(true);
    this.picked.emit(hit);
  }
}
