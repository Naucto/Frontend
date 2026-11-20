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

import { diskBody, diskStyleFor } from '../../shared/game-card/disk-style';
import { FloppyComponent } from '../../shared/game-card/floppy.component';
import { CollectionBoxComponent } from '../../shared/hub/collection-box.component';
import { GameFlyoutComponent } from '../../shared/hub/game-flyout.component';
import { HeroPileComponent } from '../../shared/hub/hero-pile.component';
import type { HubGame, HubSession } from '../../shared/hub/hub-game';
import { SessionDiskComponent } from '../../shared/hub/session-disk.component';
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
    SessionDiskComponent,
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
  protected readonly sessions = signal(openSessions(Date.now()));
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
  protected readonly tint = computed(() => {
    const lead = this.lead();
    return lead ? diskBody(diskStyleFor(lead)) : null;
  });

  protected readonly line = signal(0);
  protected readonly lines = GAMES.map((game) => game.name);

  protected readonly isGame = (game: HubGame | null): boolean => game !== null;

  /** Sits the viewer down in a session, or stands them up. */
  protected seat(session: HubSession, seated: boolean): void {
    const roster = session.roster.filter((player) => player.username !== VIEWER);
    this.sessions.update((sessions) =>
      sessions.map((other) =>
        other === session
          ? {
              ...session,
              roster: seated ? [...roster, { username: VIEWER }] : roster,
              playerCount: session.playerCount + (seated ? 1 : -1),
            }
          : other,
      ),
    );
  }

  protected say(message: string): void {
    this.toasts.show(message);
  }
}
