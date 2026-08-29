import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthStore } from '@app/core/auth/auth.store';
import { TranslocoDirective } from '@jsverse/transloco';
import { ButtonDirective, IconComponent, SearchComponent } from '@naucto/ui';
import { map } from 'rxjs';

import { AccountMenuComponent } from './account-menu.component';
import { NotificationsBellComponent } from './notifications-bell.component';

// 12px UI in a 20px line box inside 8px/12px padding: the design's nav link measures 36px tall,
// which `text-body`'s 1.65 line-height overshoots and a bare `leading-[1.2]` undershoots by six.
/**
 * The current page is marked through `aria-current`, not by adding a second colour class.
 * `routerLinkActive="text-ink"` left both `text-ink-3` and `text-ink` on the element, and with both
 * present the later rule in the stylesheet wins — so the active link was never highlighted at all.
 */
const NAV_LINK =
  'rounded-xs px-1.5 py-1 text-body leading-[20px] uppercase tracking-button text-ink-3 transition-colors hover:text-ink aria-[current]:text-ink';

/** App-wide top bar: HUB / MY GAMES / FRIENDS / LEARN, search, NEW GAME, bell, account. */
@Component({
  selector: 'nc-top-bar',
  imports: [
    RouterLink,
    RouterLinkActive,
    TranslocoDirective,
    ButtonDirective,
    IconComponent,
    SearchComponent,
    AccountMenuComponent,
    NotificationsBellComponent,
  ],
  template: `
    <header
      *transloco="let t"
      class="flex min-h-7 flex-wrap items-center gap-2 border-b border-line bg-panel px-2.5 py-1 md:flex-nowrap md:py-0"
    >
      <a routerLink="/hub" class="mr-[6px] flex shrink-0 items-center" aria-label="Naucto">
        <img src="/img/logo.png" alt="" width="32" height="32" class="pixelated" />
      </a>

      <!-- Below md the links collapse behind the menu button; the header never scrolls sideways. -->
      <button
        type="button"
        class="inline-flex h-4 w-4 items-center justify-center rounded-xs text-ink-3 hover:text-ink md:hidden"
        [attr.aria-expanded]="menuOpen()"
        [attr.aria-label]="t('nav.main')"
        (click)="menuOpen.set(!menuOpen())"
      >
        <nc-icon [name]="menuOpen() ? 'close' : 'menu'" [size]="24" />
      </button>

      <nav
        class="order-last w-full flex-wrap items-center gap-1 md:order-none md:flex md:w-auto md:min-w-[384px] md:flex-1"
        [class.flex]="menuOpen()"
        [class.hidden]="!menuOpen()"
        [attr.aria-label]="t('nav.main')"
      >
        <a routerLink="/hub" routerLinkActive ariaCurrentWhenActive="page" [class]="navLink">
          {{ t('nav.hub') }}
        </a>
        @if (auth.isAuthenticated()) {
          <a routerLink="/games" routerLinkActive ariaCurrentWhenActive="page" [class]="navLink">
            {{ t('nav.myGames') }}
          </a>
          <a routerLink="/friends" routerLinkActive ariaCurrentWhenActive="page" [class]="navLink">
            {{ t('nav.friends') }}
          </a>
        }
        <a routerLink="/learn" routerLinkActive ariaCurrentWhenActive="page" [class]="navLink">
          {{ t('nav.learn') }}
        </a>
      </nav>

      @if (search()) {
        <nc-search
          #search
          class="min-w-0 flex-1 md:flex-[0_1_420px]"
          [placeholder]="t('nav.search')"
          [value]="query()"
          (submitted)="submit($event)"
        />
      } @else {
        <span class="hidden flex-1 md:block"></span>
      }

      <div class="flex flex-1 items-center justify-end gap-1 md:min-w-[384px]">
        @if (auth.isAuthenticated()) {
          <!-- The design writes the plus, rather than drawing it: at this size the glyph and the
               icon are the same mark, and the glyph keeps the button at its 120px. Narrow enough
               and the label goes instead, leaving the icon to stand for it. -->
          <a ncButton variant="primary" size="bar" routerLink="/games/new">
            <nc-icon name="plus" [size]="12" class="sm:hidden" />
            <span class="hidden sm:inline">+ {{ t('nav.newGame') }}</span>
          </a>
          <nc-notifications-bell />
          <nc-account-menu class="ms-1" />
        } @else {
          <a ncButton variant="primary" size="bar" routerLink="/sign-in">
            {{ t('nav.signIn') }}
          </a>
        }
      </div>
    </header>
  `,
  host: { class: 'block', '(document:keydown)': 'onKey($event)' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TopBarComponent {
  protected readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly searchBox = viewChild<SearchComponent, ElementRef<HTMLElement>>('search', {
    read: ElementRef,
  });
  readonly search = input(true);

  protected readonly navLink = NAV_LINK;
  protected readonly menuOpen = signal(false);

  /** Echo the active query, so a shared `?q=` link shows what was searched for. */
  protected readonly query = toSignal(this.route.queryParamMap.pipe(map((p) => p.get('q') ?? '')), {
    initialValue: '',
  });

  protected submit(q: string): void {
    void this.router.navigate(['/hub'], { queryParams: { q: q.trim() || null } });
    this.menuOpen.set(false);
  }

  /** "/" focuses the search from anywhere that is not already a text field. */
  protected onKey(e: KeyboardEvent): void {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (
      tag === 'INPUT' ||
      tag === 'TEXTAREA' ||
      (e.target as HTMLElement | null)?.isContentEditable
    )
      return;
    const input = this.searchBox()?.nativeElement.querySelector('input');
    if (!input) return;
    e.preventDefault();
    input.focus();
  }
}
