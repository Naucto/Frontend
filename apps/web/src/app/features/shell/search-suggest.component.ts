import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  input,
  linkedSignal,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { SearchComponent } from '@naucto/ui';

import { injectSuggestions, parseTerm } from '../../shared/queries/search.queries';
import { SearchPanelComponent, type SuggestTarget } from './search-panel.component';

/**
 * The search box with the panel that drops out of it.
 *
 * The panel is out from the moment the box is reached: the most played games and the open sessions
 * before anything is typed, then what the words find, grouped by kind. A leading `#` is the
 * literal-tag operator: the panel narrows to tags and ENTER lands on everything carrying one.
 *
 * The keyboard walks into the list and back: the caret is either in the box, where ENTER runs the
 * search, or on an option, where ENTER opens it. The options are found where they are drawn, so
 * the panel may arrive after the box does.
 *
 * The box keeps its own value; the URL is only written when a search is actually run, so typing
 * does not push a history entry per keystroke.
 */
@Component({
  selector: 'nc-search-suggest',
  imports: [TranslocoDirective, SearchComponent, SearchPanelComponent],
  templateUrl: './search-suggest.component.html',
  host: {
    class: 'relative block',
    '(keydown)': 'onKey($event)',
    '(focusin)': 'onFocusIn($event)',
    '(focusout)': 'onFocusOut($event)',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchSuggestComponent {
  /** What the URL says, so the box shows the search that is actually on screen. */
  readonly query = input('');
  readonly placeholder = input('Search');

  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  protected readonly LIST_ID = 'nc-search-suggestions';
  protected readonly text = linkedSignal(() => this.query());
  protected readonly parsed = computed(() => parseTerm(this.text()));
  /** Out from reaching the box until Escape, a choice or leaving it. */
  protected readonly opened = signal(false);
  /** The option the caret is on, counted in the order they are drawn; -1 while it is in the box. */
  protected readonly cursor = signal(-1);

  protected readonly suggestions = injectSuggestions(this.text, this.opened);
  protected readonly data = computed(
    () => this.suggestions.data() ?? { games: [], people: [], sessions: [], tags: [] },
  );
  protected readonly count = computed(() => {
    const { games, people, sessions, tags } = this.data();
    return games.length + people.length + sessions.length + tags.length;
  });

  private options(): HTMLElement[] {
    return [...this.host.querySelectorAll<HTMLElement>('[role="option"]')];
  }

  /** A caret that was in the list goes back to the box first, which does not reopen the panel. */
  private close(): void {
    if (this.cursor() >= 0) {
      this.host.querySelector('input')?.focus();
    }
    this.opened.set(false);
  }

  protected onFocusIn(event: FocusEvent): void {
    this.cursor.set(this.options().indexOf(event.target as HTMLElement));
    // Focus coming back from the list must not bring back what Escape or a choice just put away.
    if (!(event.relatedTarget instanceof Node && this.host.contains(event.relatedTarget))) {
      this.opened.set(true);
    }
  }

  /** Leaving the box closes the panel, unless focus only moved inside it. */
  protected onFocusOut(event: FocusEvent): void {
    if (event.relatedTarget instanceof Node && this.host.contains(event.relatedTarget)) {
      return;
    }
    this.cursor.set(-1);
    this.opened.set(false);
  }

  protected onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      // A search field empties itself on Escape, and its `input` event would reopen the panel.
      event.preventDefault();
      if (this.opened()) {
        this.close();
      } else {
        this.text.set('');
      }
      return;
    }

    const options = this.options();
    const at = this.cursor();
    const forward = event.key === 'ArrowDown' || (event.key === 'Tab' && !event.shiftKey);
    const back = event.key === 'ArrowUp' || (event.key === 'Tab' && event.shiftKey);

    if (at < 0) {
      if (event.key === 'ArrowDown' && !this.opened()) {
        event.preventDefault();
        this.opened.set(true);
        afterNextRender(() => this.options()[0]?.focus(), { injector: this.injector });
      } else if (this.opened() && options.length > 0 && (forward || back)) {
        event.preventDefault();
        options.at(forward ? 0 : -1)?.focus();
      }
      return;
    }

    const field = this.host.querySelector('input');
    if (forward || back) {
      event.preventDefault();
      // TAB past the last option and anything back from the first return to the box; the arrow
      // down wraps instead, so holding it goes round the list.
      const leaves = back ? at === 0 : event.key === 'Tab' && at === options.length - 1;
      (leaves ? field : options[(at + (forward ? 1 : -1)) % options.length])?.focus();
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      options.at(event.key === 'Home' ? 0 : -1)?.focus();
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      options[at]?.click();
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
      // Not prevented: the character lands in the box the caret has just returned to.
      field?.focus();
    }
  }

  protected go(target: SuggestTarget): void {
    this.close();
    switch (target.kind) {
      case 'game':
        void this.router.navigate(['/play', target.id]);
        return;
      case 'session':
        // A session is joined from the game it is of; there is no screen for a room on its own.
        void this.router.navigate(['/play', target.projectId], {
          queryParams: { session: target.sessionUuid },
        });
        return;
      case 'person':
        void this.router.navigate(['/u', target.username]);
        return;
      case 'tag':
        void this.router.navigate(['/hub'], { queryParams: { tags: target.tag, q: null } });
    }
  }

  /** ENTER in the box: after a `#`, the first tag offered or the one typed; else the words. */
  protected search(): void {
    const { term, tagsOnly } = this.parsed();
    const tag = tagsOnly ? (this.data().tags[0]?.tag ?? term) : '';
    if (tag) {
      this.go({ kind: 'tag', tag });
      return;
    }
    this.close();
    void this.router.navigate(['/hub'], {
      queryParams: { q: tagsOnly ? null : this.text().trim() || null },
    });
  }
}
