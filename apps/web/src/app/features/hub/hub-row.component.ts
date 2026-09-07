import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GameCardComponent } from '@app/shared/game-card/game-card.component';
import { TranslocoDirective } from '@jsverse/transloco';
import type { ProjectExResponseDto } from '@naucto/api-client';
import { IconComponent, SkeletonComponent } from '@naucto/ui';

/** Whether the shelf has its games, is still asking, or could not find out. */
export type ShelfState = 'ready' | 'pending' | 'error';

/** A titled shelf of game cards, five to a row at full width, with a "see all" link and actions. */
@Component({
  selector: 'nc-hub-row',
  imports: [RouterLink, TranslocoDirective, GameCardComponent, IconComponent, SkeletonComponent],
  template: `
    <ng-container *transloco="let t">
      @if (title() || seeAll()) {
        <!-- Wraps rather than compresses: at a phone width the title, the filters and
             SEE ALL each want a line of their own instead of three squeezed columns. -->
        <div class="mb-1.5 flex flex-wrap items-center gap-x-1.75 gap-y-1">
          @if (title()) {
            <h2 class="text-title text-ink">{{ title() }}</h2>
          }
          <ng-content select="[actions]" />
          @if (seeAll(); as link) {
            <!-- An icon, not a literal arrow: HD44780 has no glyph for → and it rendered as a
                 stray mark on every shelf. A chevron rather than a full arrow, so it is the exact
                 mirror of the one SEE ALL's own page uses to come back. -->
            <a
              [routerLink]="link"
              class="ms-auto flex items-center gap-0.75 font-mono text-meta tracking-tag text-ink-3 uppercase hover:text-ink"
            >
              @if (count()) {
                {{ t('hub.seeAllCount', { n: count() }) }}
              } @else {
                {{ t('hub.seeAll') }}
              }
              <nc-icon name="arrow-right" [size]="12" />
            </a>
          }
        </div>
      }
      <!-- Five to a row at the width the design was drawn at, fewer as the window narrows. -->
      <div class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        @switch (state()) {
          @case ('pending') {
            <!-- At the card's real geometry, so the shelf does not jump when the games land. -->
            @for (i of placeholders; track i) {
              <div class="overflow-hidden rounded-md border border-line">
                <nc-skeleton height="202px" radius="rounded-none" />
                <div class="grid gap-1 p-1.5">
                  <nc-skeleton height="0.9rem" width="70%" />
                  <nc-skeleton height="0.7rem" width="45%" />
                </div>
              </div>
            }
          }
          @case ('error') {
            <!-- Never the empty copy: "we could not ask" is not "there is nothing". -->
            <p class="col-span-full text-body text-hot-ink">{{ t('hub.rowError') }}</p>
          }
          @default {
            @for (g of games(); track g.id) {
              <nc-game-card [game]="g" [draft]="drafts()" />
            } @empty {
              <p class="col-span-full text-body text-ink-3">{{ empty() }}</p>
            }
          }
        }
      </div>
    </ng-container>
  `,
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HubRowComponent {
  readonly title = input<string>('');
  readonly games = input.required<ProjectExResponseDto[]>();
  readonly seeAll = input<string | unknown[] | null>(null);
  readonly empty = input('Nothing here yet.');
  /** How many games the shelf has in total, shown beside "see all". */
  readonly count = input(0);
  /** Render the cards as drafts, linking to the editor. */
  readonly drafts = input(false);
  readonly state = input<ShelfState>('ready');
  protected readonly placeholders = [0, 1, 2, 3, 4];
}
