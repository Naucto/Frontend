import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import type { HubShelfDto } from '@naucto/api-client';
import { ShelfComponent, ShelfFlyoutDirective, ShelfItemDirective } from '@naucto/ui';

import { GameFlyoutComponent } from '../../shared/hub/game-flyout.component';
import { ShelfDiskComponent } from '../../shared/hub/shelf-disk.component';
import { SeeAllLinkComponent } from './see-all-link.component';
import { shelfTitle } from './shelf-title';

/** One of the hub's shelves of games to play, with the way to everything it holds. */
@Component({
  selector: 'nc-hub-shelf',
  imports: [
    TranslocoDirective,
    GameFlyoutComponent,
    SeeAllLinkComponent,
    ShelfComponent,
    ShelfDiskComponent,
    ShelfFlyoutDirective,
    ShelfItemDirective,
  ],
  templateUrl: './hub-shelf.component.html',
  host: { class: 'block min-w-0' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HubShelfComponent {
  readonly shelf = input.required<HubShelfDto>();

  private readonly transloco = inject(TranslocoService);
  protected readonly title = computed(() => shelfTitle(this.shelf().key, this.transloco));
}
