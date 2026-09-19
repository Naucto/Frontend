import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { friendsApi } from '@app/core/api/planned.api';
import { AuthStore } from '@app/core/auth/auth.store';
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
  template: `
    <ng-container *transloco="let t">
      <nc-search
        class="w-full"
        [class.rounded-b-none]="open()"
        [size]="size()"
        [placeholder]="placeholder()"
        [hint]="''"
        [(value)]="text"
        (focusin)="dismissed.set(false)"
        (focusout)="dismissed.set(true)"
      />

      @if (open()) {
        <nc-suggest-panel [label]="t('share.people')">
          @if (friendHits().length) {
            <p class="label px-[14px] pt-[10px] pb-[6px] text-ink-4">{{ t('nav.friends') }}</p>
            @for (p of friendHits(); track p.id) {
              <nc-suggest-row (click)="choose(p)">
                <nc-avatar
                  class="shrink-0"
                  [size]="22"
                  [id]="p.id"
                  [name]="p.nickname ?? p.username"
                />
                <span class="min-w-0 flex-1 truncate text-body text-ink">
                  <nc-highlight [text]="p.username" [match]="term()" />
                </span>
              </nc-suggest-row>
            }
          }
          @if (otherHits().length) {
            <p class="label px-[14px] pt-[10px] pb-[6px] text-ink-4">{{ t('search.people') }}</p>
            @for (p of otherHits(); track p.id) {
              <nc-suggest-row (click)="choose(p)">
                <nc-avatar
                  class="shrink-0"
                  [size]="22"
                  [id]="p.id"
                  [name]="p.nickname ?? p.username"
                  [src]="p.profileImageUrl ?? null"
                />
                <span class="min-w-0 flex-1 truncate text-body text-ink">
                  <nc-highlight [text]="p.username" [match]="term()" />
                </span>
              </nc-suggest-row>
            }
          }
          @if (!friendHits().length && !otherHits().length) {
            <p class="px-[14px] py-[10px] text-body text-ink-3">
              {{ hits.isError() ? t('share.searchFailed') : t('friends.noMatch', { q: term() }) }}
            </p>
          }
        </nc-suggest-panel>
      }
    </ng-container>
  `,
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
    queryKey: ['search', 'people', this.term()],
    queryFn: (): Promise<PersonHit[]> => searchPeople(this.term(), SHOWN),
    enabled: this.term().length > 0,
    staleTime: 30_000,
  }));

  private readonly friends = injectQuery(() => ({
    queryKey: ['friends'],
    queryFn: () => friendsApi.list(),
    enabled: this.auth.isAuthenticated(),
    retry: false,
  }));

  private readonly offerable = computed(() => {
    const out = new Set(this.exclude());
    const me = this.auth.userId();
    if (me !== null) out.add(me);
    return out;
  });

  protected readonly friendHits = computed(() => {
    const needle = this.term().toLowerCase();
    if (!needle) return [];
    const out = this.offerable();
    return (this.friends.data() ?? [])
      .filter(
        (f) =>
          !out.has(f.id) &&
          (f.username.toLowerCase().includes(needle) ||
            (f.nickname ?? '').toLowerCase().includes(needle)),
      )
      .slice(0, SHOWN)
      .map((f): PersonHit => ({ id: f.id, username: f.username, nickname: f.nickname }));
  });

  /** Whoever the server found who is not already offered above, and not already on the project. */
  protected readonly otherHits = computed(() => {
    const shown = new Set(this.friendHits().map((f) => f.id));
    const out = this.offerable();
    return (this.hits.data() ?? []).filter((p) => !shown.has(p.id) && !out.has(p.id));
  });

  protected choose(p: PersonHit): void {
    this.text.set('');
    this.dismissed.set(true);
    this.picked.emit(p);
  }
}
