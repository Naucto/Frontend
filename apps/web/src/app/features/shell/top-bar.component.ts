import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink, RouterLinkActive } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { ButtonDirective, IconComponent, LogoComponent } from '@naucto/ui';
import { map } from 'rxjs';

import { AuthStore } from '../../core/auth/auth.store';
import { AccountMenuComponent } from './account-menu.component';
import { NotificationsBellComponent } from './notifications-bell.component';
import { SearchSuggestComponent } from './search-suggest.component';

/**
 * The current page is marked through `aria-current`, not a second colour class: with two colour
 * utilities on one element, stylesheet order decides which one wins.
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
    SearchSuggestComponent,
    AccountMenuComponent,
    NotificationsBellComponent,
    LogoComponent,
  ],
  templateUrl: './top-bar.component.html',
  host: { class: 'block', '(document:keydown)': 'onKey($event)' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TopBarComponent {
  protected readonly auth = inject(AuthStore);
  private readonly route = inject(ActivatedRoute);
  private readonly searchBox = viewChild<SearchSuggestComponent, ElementRef<HTMLElement>>(
    'search',
    { read: ElementRef },
  );
  protected readonly navLink = NAV_LINK;
  protected readonly menuOpen = signal(false);

  /** Echo the active query, so a shared `?q=` link shows what was searched for. */
  protected readonly query = toSignal(
    this.route.queryParamMap.pipe(map((params) => params.get('q') ?? '')),
    {
      initialValue: '',
    },
  );

  /** "/" focuses the search from anywhere that is not already a text field. */
  protected onKey(event: KeyboardEvent): void {
    if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    const tag = (event.target as HTMLElement | null)?.tagName;
    if (
      tag === 'INPUT' ||
      tag === 'TEXTAREA' ||
      (event.target as HTMLElement | null)?.isContentEditable
    ) {
      return;
    }
    const input = this.searchBox()?.nativeElement.querySelector('input');
    if (!input) {
      return;
    }
    event.preventDefault();
    input.focus();
  }
}
