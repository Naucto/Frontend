import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { ErrorStateComponent } from '@naucto/ui';

import { injectHubShelves } from '../../shared/queries/hub.queries';
import { HubShelfComponent } from './hub-shelf.component';
import { ShelfSkeletonComponent } from './shelf-skeleton.component';

/**
 * A few of the hub's later shelves, asked for together once the reader nears them. Until they
 * answer their places are held; if they cannot, the batch says so on its own and can be asked
 * again, and the shelves around it are untouched.
 */
@Component({
  selector: 'nc-tag-shelves',
  imports: [TranslocoDirective, ErrorStateComponent, HubShelfComponent, ShelfSkeletonComponent],
  templateUrl: './tag-shelves.component.html',
  host: { class: 'contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TagShelvesComponent {
  readonly keys = input.required<readonly string[]>();
  readonly shelves = injectHubShelves(() => this.keys());
}
