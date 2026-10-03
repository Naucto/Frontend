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
import { TranslocoDirective } from '@jsverse/transloco';
import {
  AvatarComponent,
  HighlightComponent,
  IconComponent,
  OnlineDotComponent,
  SearchComponent,
  SuggestPanelComponent,
  SuggestRowComponent,
} from '@naucto/ui';

import { PresenceStore } from '../../core/presence/presence.store';
import { type PresenceLine, presenceLine } from '../../core/presence/presence-line';
import { GameCoverComponent } from '../../shared/game-card/game-cover.component';
import {
  injectSuggestions,
  parseTerm,
  type PersonHit,
  type Suggestions,
} from '../../shared/queries/search.queries';

/** What pressing ENTER on a row does, which is the only thing the panel needs to know about it. */
type Target =
  | { kind: 'game'; id: number }
  | { kind: 'person'; username: string }
  | { kind: 'session'; projectId: number }
  | { kind: 'tag'; tag: string };

/**
 * The sections in the order they are drawn, which is also the order the keyboard walks them: the
 * cursor indexes and each section's offset are both read from this one list.
 */
const SECTIONS: readonly { key: keyof Suggestions; targets: (results: Suggestions) => Target[] }[] =
  [
    {
      key: 'games',
      targets: (results) => results.games.map((game) => ({ kind: 'game', id: game.id })),
    },
    {
      key: 'people',
      targets: (results) =>
        results.people.map((person) => ({ kind: 'person', username: person.username })),
    },
    {
      key: 'sessions',
      targets: (results) =>
        results.sessions.map((session) => ({ kind: 'session', projectId: session.projectId })),
    },
    {
      key: 'tags',
      targets: (results) => results.tags.map((tag) => ({ kind: 'tag', tag: tag.tag })),
    },
  ];

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
  templateUrl: './search-suggest.component.html',
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
    const shown = this.parsed().tagsOnly
      ? SECTIONS.filter((section) => section.key === 'tags')
      : SECTIONS;
    return shown.flatMap((section) => section.targets(this.data()));
  });

  /**
   * Reset to the first row whenever the list changes — the design pre-selects it.
   *
   * One highlight, moved by either device: the pointer sets it on hover and the arrows step it, so
   * a row is never lit under the mouse while a different one answers to ENTER.
   */
  protected readonly cursor = linkedSignal<Target[], number>({
    source: this.targets,
    computation: (rows, prev) =>
      rows.length === 0 ? -1 : Math.min(prev?.value ?? 0, rows.length - 1),
  });

  /** Where each section starts in `targets`, so a row's cursor index is its section plus its own. */
  protected readonly offsets = computed(() => {
    const offsets = { games: 0, people: 0, sessions: 0, tags: 0 };
    let start = 0;
    for (const section of SECTIONS) {
      offsets[section.key] = start;
      start += this.data()[section.key].length;
    }
    return offsets;
  });

  /** What a person is doing, when we are told — presence only reaches us for friends. */
  protected presenceOf(person: PersonHit): PresenceLine | null {
    return presenceLine(this.presence.of(person.id));
  }

  protected onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.dismissed.set(true);
      return;
    }
    if (!this.open()) {
      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const rows = this.targets().length;
      if (rows === 0) {
        return;
      }
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
    if (next instanceof Node && this.host.nativeElement.contains(next)) {
      return;
    }
    this.dismissed.set(true);
  }

  protected commit(): void {
    const row = this.targets()[this.cursor()];
    if (row) {
      this.go(row);
    } else {
      this.commitSearch();
    }
  }

  protected go(target: Target): void {
    this.dismissed.set(true);
    switch (target.kind) {
      case 'game':
        void this.router.navigate(['/play', target.id]);
        return;
      case 'session':
        // A session is joined from the game it is of; there is no screen for a room on its own.
        void this.router.navigate(['/play', target.projectId]);
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
