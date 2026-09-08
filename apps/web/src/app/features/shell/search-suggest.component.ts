import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  linkedSignal,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { PresenceStore } from '@app/core/presence/presence.store';
import { GameCoverComponent } from '@app/shared/game-card/game-cover.component';
import { injectSuggestions, parseTerm, type PersonHit } from '@app/shared/queries/search.queries';
import { TranslocoDirective } from '@jsverse/transloco';
import { type ProjectExResponseDto } from '@naucto/api-client';
import {
  AvatarComponent,
  HighlightComponent,
  IconComponent,
  OnlineDotComponent,
  SearchComponent,
  SuggestPanelComponent,
  SuggestRowComponent,
} from '@naucto/ui';

/** What pressing ENTER on a row does, which is the only thing the panel needs to know about it. */
type Target =
  | { kind: 'game'; id: number }
  | { kind: 'person'; username: string }
  | { kind: 'session'; projectId: number }
  | { kind: 'tag'; tag: string };

/**
 * The search box with the panel that drops out of it.
 *
 * The panel opens on the first character and groups what it finds by kind, because a mixed list
 * cannot say why two rows sit next to each other. A leading `#` is the literal-tag operator: the
 * panel narrows to tags and ENTER lands on everything carrying one.
 *
 * The box keeps its own value; the URL is only written when a search is actually run, so typing
 * does not push a history entry per keystroke.
 */
@Component({
  selector: 'nc-search-suggest',
  imports: [
    TranslocoDirective,
    SearchComponent,
    SuggestPanelComponent,
    SuggestRowComponent,
    HighlightComponent,
    AvatarComponent,
    IconComponent,
    OnlineDotComponent,
    GameCoverComponent,
  ],
  template: `
    <ng-container *transloco="let t">
      <nc-search
        #box
        class="w-full"
        [class.rounded-b-none]="open()"
        [placeholder]="placeholder()"
        [(value)]="text"
        [hint]="open() ? 'ESC' : '/'"
        (submitted)="commit()"
      />

      @if (open()) {
        <nc-suggest-panel [label]="t('nav.suggestions')">
          @let s = data();
          @if (parsed().tagsOnly) {
            <div class="flex items-center gap-2 px-[14px] pt-[10px] pb-[6px]">
              <span class="label text-ink-4">{{ t('search.tags') }}</span>
              <span class="label rounded-xs border border-line px-[5px] py-px text-gold">
                {{ t('search.tagsOnly') }}
              </span>
            </div>
            @for (tag of s.tags; track tag.tag; let i = $index) {
              <nc-suggest-row
                [selected]="cursor() === i"
                (click)="go({ kind: 'tag', tag: tag.tag })"
              >
                <span class="font-mono text-[10px] tracking-wide">
                  <nc-highlight [text]="tag.tag" [match]="parsed().term" />
                </span>
                <span class="ms-auto label text-ink-4">{{ tag.count }}</span>
              </nc-suggest-row>
            }
          } @else {
            @if (s.games.length) {
              <p class="label px-[14px] pt-[10px] pb-[6px] text-ink-4">{{ t('search.games') }}</p>
              @for (g of s.games; track g.id) {
                <nc-suggest-row
                  [selected]="cursor() === indexOf({ kind: 'game', id: g.id })"
                  (click)="go({ kind: 'game', id: g.id })"
                >
                  <nc-game-cover
                    class="h-[25px] w-[44px] shrink-0 rounded-xs"
                    [bordered]="false"
                    [releaseId]="g.id"
                    [iconSize]="12"
                  />
                  <span class="min-w-0 flex-[2_1_auto] truncate text-body text-ink">
                    <nc-highlight [text]="g.name" [match]="parsed().term" />
                  </span>
                  <span class="label min-w-0 flex-[0_1_auto] truncate text-ink-4">
                    {{ t('search.byPlays', { name: creatorOf(g), plays: g.viewCount }) }}
                  </span>
                </nc-suggest-row>
              }
            }

            @if (s.people.length) {
              <p class="label px-[14px] pt-[10px] pb-[6px] text-ink-4">{{ t('search.people') }}</p>
              @for (p of s.people; track p.id) {
                <nc-suggest-row
                  [selected]="cursor() === indexOf({ kind: 'person', username: p.username })"
                  (click)="go({ kind: 'person', username: p.username })"
                >
                  <nc-avatar
                    class="shrink-0"
                    [size]="22"
                    [id]="p.id"
                    [name]="p.nickname ?? p.username"
                    [src]="p.profileImageUrl ?? null"
                  />
                  <span class="min-w-0 flex-1 truncate text-body text-ink">
                    <nc-highlight [text]="p.username" [match]="parsed().term" />
                  </span>
                  @let doing = presenceOf(p);
                  @if (doing) {
                    <span class="flex shrink-0 items-center gap-1.5">
                      <nc-online-dot [online]="true" />
                      <span class="label text-ink-4">{{ doing }}</span>
                    </span>
                  }
                </nc-suggest-row>
              }
            }

            @if (s.sessions.length) {
              <p class="label px-[14px] pt-[10px] pb-[6px] text-ink-4">{{ t('search.liveNow') }}</p>
              @for (v of s.sessions; track v.sessionUuid) {
                <nc-suggest-row
                  [selected]="cursor() === indexOf({ kind: 'session', projectId: v.projectId })"
                  (click)="go({ kind: 'session', projectId: v.projectId })"
                >
                  <nc-online-dot class="shrink-0" [online]="true" />
                  <span class="min-w-0 flex-[2_1_auto] truncate text-body text-ink">
                    <nc-highlight [text]="v.projectName" [match]="parsed().term" />
                  </span>
                  <span class="label min-w-0 flex-[0_1_auto] truncate text-ink-4">
                    {{
                      t('search.slotsHost', {
                        players: v.playerCount,
                        max: v.maxPlayers,
                        name: v.hostNickname || v.hostUsername,
                      })
                    }}
                  </span>
                  <span
                    class="label shrink-0 rounded-xs border border-jade-line px-[7px] py-[3px] text-jade-ink"
                  >
                    {{ t('net.join.join') }}
                  </span>
                </nc-suggest-row>
              }
            }

            @if (s.tags.length) {
              <p class="label px-[14px] pt-[10px] pb-[6px] text-ink-4">{{ t('search.tags') }}</p>
              <div class="flex flex-wrap gap-1.5 px-[14px] pt-[2px] pb-[12px]">
                @for (tag of s.tags; track tag.tag) {
                  <button
                    type="button"
                    class="rounded-xs bg-raised px-2 py-1 font-mono text-[10px] tracking-wide text-ink-2"
                    [class.outline]="cursor() === indexOf({ kind: 'tag', tag: tag.tag })"
                    [class.outline-gold]="cursor() === indexOf({ kind: 'tag', tag: tag.tag })"
                    (click)="go({ kind: 'tag', tag: tag.tag })"
                  >
                    <nc-highlight [text]="tag.tag" [match]="parsed().term" />
                  </button>
                }
              </div>
            }

            @if (empty()) {
              <p class="px-[14px] py-[14px] text-body text-ink-3">
                <span class="label text-ink-4">{{ t('search.nothingYet') }}</span>
                {{ t('search.enterAnyway') }}
              </p>
            }
          }

          <span footer class="flex items-center gap-4 label text-ink-4">
            @if (parsed().tagsOnly) {
              <span>{{ t('search.footerTags', { tag: parsed().term }) }}</span>
            } @else {
              <span class="flex items-center gap-1">
                <nc-icon name="arrow-up" [size]="12" />
                <nc-icon name="arrow-down" [size]="12" />
                {{ t('search.move') }}
              </span>
              <span>{{ t('search.enterOpen') }}</span>
              <span>{{ t('search.tabResults') }}</span>
            }
            <span class="ms-auto">{{ t('search.escClose') }}</span>
          </span>
        </nc-suggest-panel>
      }
    </ng-container>
  `,
  host: {
    class: 'relative block',
    '(keydown)': 'onKey($event)',
    '(input)': 'dismissed.set(false)',
    '(focusin)': 'dismissed.set(false)',
    '(focusout)': 'onFocusOut($event)',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchSuggestComponent {
  /** What the URL says, so the box shows the search that is actually on screen. */
  readonly query = input('');
  readonly placeholder = input('Search');

  private readonly router = inject(Router);
  private readonly presence = inject(PresenceStore);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly text = linkedSignal(() => this.query());
  protected readonly parsed = computed(() => parseTerm(this.text()));
  /** Escape and leaving the box put the panel away; the next keystroke brings it back. */
  protected readonly dismissed = signal(false);

  private readonly suggestions = injectSuggestions(this.text);
  protected readonly data = computed(
    () => this.suggestions.data() ?? { games: [], people: [], sessions: [], tags: [] },
  );

  protected readonly open = computed(() => !this.dismissed() && this.parsed().term.length > 0);
  protected readonly empty = computed(() => this.targets().length === 0);

  /** Every row the keyboard can land on, in the order they are drawn. */
  private readonly targets = computed<Target[]>(() => {
    const s = this.data();
    if (this.parsed().tagsOnly) return s.tags.map((t) => ({ kind: 'tag' as const, tag: t.tag }));
    return [
      ...s.games.map((g) => ({ kind: 'game' as const, id: g.id })),
      ...s.people.map((p) => ({ kind: 'person' as const, username: p.username })),
      ...s.sessions.map((v) => ({ kind: 'session' as const, projectId: v.projectId })),
      ...s.tags.map((t) => ({ kind: 'tag' as const, tag: t.tag })),
    ];
  });

  /** Reset to the first row whenever the list changes — the design pre-selects it. */
  protected readonly cursor = linkedSignal<Target[], number>({
    source: this.targets,
    computation: (rows, prev) =>
      rows.length === 0 ? -1 : Math.min(prev?.value ?? 0, rows.length - 1),
  });

  protected indexOf(target: Target): number {
    return this.targets().findIndex((row) => JSON.stringify(row) === JSON.stringify(target));
  }

  protected creatorOf(game: ProjectExResponseDto): string {
    const creator = (game as { creator?: { nickname?: string | null; username?: string } }).creator;
    return creator?.nickname ?? creator?.username ?? '';
  }

  /** What a person is doing, when we are told — presence only reaches us for friends. */
  protected presenceOf(person: PersonHit): string | null {
    const p = this.presence.of(person.id);
    if (!p || p.kind === 'IDLE') return null;
    return p.title ? `${p.kind} · ${p.title}` : p.kind;
  }

  protected onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.dismissed.set(true);
      return;
    }
    if (!this.open()) return;

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const rows = this.targets().length;
      if (rows === 0) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      this.cursor.set((this.cursor() + step + rows) % rows);
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      this.commitSearch();
    }
  }

  /** Leaving the box closes the panel, unless focus only moved inside it. */
  protected onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget;
    if (next instanceof Node && this.host.nativeElement.contains(next)) return;
    this.dismissed.set(true);
  }

  protected commit(): void {
    const row = this.targets()[this.cursor()];
    if (row) this.go(row);
    else this.commitSearch();
  }

  protected go(target: Target): void {
    this.dismissed.set(true);
    switch (target.kind) {
      case 'game':
        void this.router.navigate(['/games', target.id]);
        return;
      case 'session':
        void this.router.navigate(['/games', target.projectId]);
        return;
      case 'person':
        void this.router.navigate(['/u', target.username]);
        return;
      case 'tag':
        void this.router.navigate(['/hub'], { queryParams: { tags: target.tag, q: null } });
    }
  }

  private commitSearch(): void {
    this.dismissed.set(true);
    void this.router.navigate(['/hub'], { queryParams: { q: this.text().trim() || null } });
  }
}
