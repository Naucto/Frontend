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
import { AuthStore } from '@app/core/auth/auth.store';
import { injectFriends } from '@app/shared/queries/friends.queries';
import { qk } from '@app/shared/queries/query-keys';
import { type PersonHit, searchPeople } from '@app/shared/queries/search.queries';
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
    queryKey: qk.searchPeople(this.term()),
    queryFn: (): Promise<PersonHit[]> => searchPeople(this.term(), SHOWN),
    enabled: this.term().length > 0,
    staleTime: 30_000,
  }));

  private readonly friends = injectFriends(() => this.auth.isAuthenticated());

  private readonly excluded = computed(() => {
    const out = new Set(this.exclude());
    const me = this.auth.userId();
    if (me !== null) out.add(me);
    return out;
  });

  protected readonly friendHits = computed(() => {
    const needle = this.term().toLowerCase();
    if (!needle) return [];
    const excluded = this.excluded();
    return (this.friends.data() ?? [])
      .filter(
        (f) =>
          !excluded.has(f.id) &&
          (f.username.toLowerCase().includes(needle) ||
            (f.nickname ?? '').toLowerCase().includes(needle)),
      )
      .slice(0, SHOWN)
      .map((f): PersonHit => ({ id: f.id, username: f.username, nickname: f.nickname }));
  });

  /** Whoever the server found who is not already offered above, and not already on the project. */
  protected readonly otherHits = computed(() => {
    const shown = new Set(this.friendHits().map((f) => f.id));
    const excluded = this.excluded();
    return (this.hits.data() ?? []).filter((p) => !shown.has(p.id) && !excluded.has(p.id));
  });

  private readonly rows = computed(() => [...this.friendHits(), ...this.otherHits()]);

  protected readonly cursor = linkedSignal({ source: this.term, computation: () => 0 });

  protected onKey(e: KeyboardEvent): void {
    const n = this.rows().length;
    if (e.key === 'Escape') {
      this.dismissed.set(true);
    } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && this.open() && n) {
      e.preventDefault();
      this.cursor.update((c) => (c + (e.key === 'ArrowDown' ? 1 : -1) + n) % n);
    }
  }

  protected commit(): void {
    const p = this.rows()[this.cursor()];
    if (this.open() && p) this.choose(p);
  }

  protected choose(p: PersonHit): void {
    this.text.set('');
    this.dismissed.set(true);
    this.picked.emit(p);
  }
}
