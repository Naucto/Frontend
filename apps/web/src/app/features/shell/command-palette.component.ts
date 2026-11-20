import { DialogRef } from '@angular/cdk/dialog';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  linkedSignal,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { projectControllerFindAll } from '@naucto/api-client';
import {
  HighlightComponent,
  IconComponent,
  type IconName,
  KeycapComponent,
  SuggestRowComponent,
  WELL,
} from '@naucto/ui';
import { injectQuery } from '@tanstack/angular-query-experimental';

import { unwrap } from '../../core/api/api-errors';
import { AuthStore } from '../../core/auth/auth.store';
import { ThemeService } from '../../core/theme/theme.service';
import { FeedbackLauncher } from '../../shared/feedback/feedback-launcher.service';
import { arrowStep } from '../../shared/list-cursor';
import { qk } from '../../shared/queries/query-keys';
import { injectSuggestions } from '../../shared/queries/search.queries';

/** How many of your own games lead the list before anything is typed. */
const RECENT_SHOWN = 3;

/** One thing ENTER can run: a game to open or something the app does. */
interface Row {
  icon: IconName;
  label: string;
  /** The few words at the far end that tell two rows of the same name apart. */
  meta: string;
  run: () => void;
}

interface Group {
  label: string;
  /** Where its first row sits among every row drawn, which is what the cursor counts in. */
  start: number;
  rows: Row[];
}

/**
 * Games and what the app can do, in one list under one field.
 *
 * Before anything is typed the games are the ones you edited last, which open in the editor; once
 * something is, they are what the hub's search finds, which open to be played. The actions are the
 * ones the chrome already offers to whoever is looking, narrowed by the same words.
 *
 * The caret never leaves the field: the arrows move a highlight the field points at, so typing
 * goes on narrowing while a row is lit.
 */
@Component({
  selector: 'nc-command-palette',
  imports: [
    TranslocoDirective,
    HighlightComponent,
    IconComponent,
    KeycapComponent,
    SuggestRowComponent,
  ],
  templateUrl: './command-palette.component.html',
  host: {
    class:
      'flat-lg bevel-fill-panel block animate-rise text-ink [filter:drop-shadow(0_6px_0_var(--nc-well))]',
    '(keydown)': 'onKey($event)',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CommandPaletteComponent {
  private readonly ref = inject(DialogRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthStore);
  private readonly theme = inject(ThemeService);
  private readonly feedback = inject(FeedbackLauncher);
  private readonly i18n = inject(TranslocoService);

  protected readonly well = WELL;
  protected readonly text = signal('');
  protected readonly term = computed(() => this.text().trim());

  private readonly found = injectSuggestions(this.text);

  /** `/projects` answers newest edit first, so its first page is the recent ones as it stands. */
  private readonly recent = injectQuery(() => ({
    queryKey: qk.myProjects({ page: 1, limit: RECENT_SHOWN }),
    enabled: this.auth.isAuthenticated(),
    queryFn: async () =>
      unwrap(await projectControllerFindAll({ query: { page: 1, limit: RECENT_SHOWN } })),
  }));

  private readonly games = computed<Row[]>(() => {
    if (this.term()) {
      return (this.found.data()?.games ?? []).map((game) => ({
        icon: 'gamepad',
        label: game.name,
        meta: game.creator.username,
        run: () => void this.router.navigate(['/play', game.id]),
      }));
    }
    return (this.recent.data()?.projects ?? []).map((project) => ({
      icon: 'gamepad',
      label: project.name,
      meta: this.i18n.translate('palette.edit'),
      run: () => void this.router.navigate(['/edit', project.id]),
    }));
  });

  private readonly actions = computed<Row[]>(() => {
    const translate = (key: string): string => this.i18n.translate(key);
    const go = (icon: IconName, label: string, path: string): Row => ({
      icon,
      label,
      meta: '',
      run: () => void this.router.navigateByUrl(path),
    });
    const username = this.auth.user()?.username;

    return [
      go('home', translate('nav.hub'), '/hub'),
      ...(username
        ? [
            go('folder', translate('nav.myGames'), '/games'),
            go('plus', translate('nav.newGame'), '/games/new'),
            go('users', translate('nav.friends'), '/friends'),
            go('user', translate('account.profile'), `/u/${encodeURIComponent(username)}`),
            go('sliders', translate('account.settings'), '/settings'),
          ]
        : []),
      go('book-open', translate('nav.learn'), '/learn'),
      {
        icon: this.theme.effective() === 'dark' ? 'sun' : 'moon',
        label: translate('palette.toggleTheme'),
        meta: '',
        run: () => {
          this.theme.toggle();
        },
      },
      {
        icon: 'bug',
        label: translate('feedback.bug.title'),
        meta: '',
        run: () => {
          this.feedback.reportBug();
        },
      },
      {
        icon: 'message',
        label: translate('feedback.rating.menu'),
        meta: '',
        run: () => {
          this.feedback.rate();
        },
      },
      username
        ? {
            icon: 'logout',
            label: translate('account.signOut'),
            meta: '',
            run: () => {
              void this.auth.logout().then(() => this.router.navigateByUrl('/hub'));
            },
          }
        : go('login', translate('nav.signIn'), '/sign-in'),
    ];
  });

  protected readonly groups = computed<Group[]>(() => {
    const needle = this.term().toLowerCase();
    const games = this.games();
    const actions = this.actions().filter((row) => row.label.toLowerCase().includes(needle));
    return [
      {
        label: needle ? this.i18n.translate('search.games') : this.i18n.translate('palette.recent'),
        start: 0,
        rows: games,
      },
      { label: this.i18n.translate('palette.actions'), start: games.length, rows: actions },
    ].filter((group) => group.rows.length > 0);
  });

  protected readonly rows = computed(() => this.groups().flatMap((group) => group.rows));

  /** One highlight for the pointer and the arrows alike, back on the first row when the list changes. */
  protected readonly cursor = linkedSignal<Row[], number>({
    source: this.rows,
    computation: (rows, prev) =>
      rows.length === 0 ? -1 : Math.min(Math.max(prev?.value ?? 0, 0), rows.length - 1),
  });

  /** Closed first: what a row runs may open a dialog of its own, or leave the page this sits over. */
  protected run(row: Row): void {
    this.ref.close();
    row.run();
  }

  protected onKey(event: KeyboardEvent): void {
    const next = arrowStep(event.key, this.cursor(), this.rows().length);
    if (next !== null) {
      event.preventDefault();
      this.cursor.set(next);
      this.host.nativeElement
        .querySelectorAll('[role="option"]')
        [next]?.scrollIntoView({ block: 'nearest' });
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const row = this.rows()[this.cursor()];
      if (row) {
        this.run(row);
      }
    }
  }
}
