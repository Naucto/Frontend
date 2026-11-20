import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  ButtonDirective,
  DitherBackdropComponent,
  FieldComponent,
  FitTextDirective,
  IconComponent,
  InputDirective,
  ScrambleDirective,
  ShelfComponent,
  ShelfFlyoutDirective,
  ShelfItemDirective,
  ToastService,
} from '@naucto/ui';

import { FloppyComponent } from '../../shared/game-card/floppy.component';
import { CollectionBoxComponent } from '../../shared/hub/collection-box.component';
import { GameFlyoutComponent } from '../../shared/hub/game-flyout.component';
import { HeroPileComponent } from '../../shared/hub/hero-pile.component';
import type { HubGame } from '../../shared/hub/hub-game';
import { SessionFlyoutComponent } from '../../shared/hub/session-flyout.component';
import { ShelfDiskComponent } from '../../shared/hub/shelf-disk.component';
import { COLLECTIONS, GAMES, HERO, openSessions, VIEWER } from './hub-pieces.fixtures';

/** The pieces the hub page is assembled from, on fixtures, over their own dither ground. */
@Component({
  selector: 'nc-hub-pieces-section',
  imports: [
    ButtonDirective,
    CollectionBoxComponent,
    DitherBackdropComponent,
    FieldComponent,
    FitTextDirective,
    FloppyComponent,
    GameFlyoutComponent,
    HeroPileComponent,
    IconComponent,
    InputDirective,
    ScrambleDirective,
    SessionFlyoutComponent,
    ShelfComponent,
    ShelfDiskComponent,
    ShelfFlyoutDirective,
    ShelfItemDirective,
  ],
  templateUrl: './hub-pieces.section.html',
  host: { class: 'relative block min-w-0 scroll-mt-[80px] [--nc-page-gutter:28px]' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HubPiecesSection {
  private readonly toasts = inject(ToastService);

  protected readonly games = GAMES;
  /** The owner's shelf opens on the game that does not exist yet. */
  protected readonly mine: readonly (HubGame | null)[] = [null, ...GAMES.slice(4, 9)];
  protected readonly sessions = openSessions(Date.now());
  protected readonly collections = COLLECTIONS;
  protected readonly viewer = VIEWER;

  protected readonly front = signal(0);
  /** A clip to try on the disk in front: the showcase ships none of its own. */
  protected readonly clip = signal('');
  protected readonly hero = computed(() =>
    HERO.map((entry, index) =>
      index === 0 && this.clip()
        ? { ...entry, game: { ...entry.game, clipUrl: this.clip() } }
        : entry,
    ),
  );
  protected readonly lead = computed(() => this.hero()[this.front()]?.game);

  protected readonly line = signal(0);
  protected readonly lines = GAMES.map((game) => game.name);

  protected readonly isGame = (game: HubGame | null): boolean => game !== null;

  protected say(message: string): void {
    this.toasts.show(message);
  }
}
