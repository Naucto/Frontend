import { ChangeDetectionStrategy, Component } from '@angular/core';
import { SkeletonComponent } from '@naucto/ui';

/** A shelf that has not arrived: its heading and one row of disks, where the shelf will stand. */
@Component({
  selector: 'nc-shelf-skeleton',
  imports: [SkeletonComponent],
  templateUrl: './shelf-skeleton.component.html',
  host: { class: 'grid min-w-0 gap-[18px] pb-[44px]', 'aria-hidden': 'true' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShelfSkeletonComponent {
  protected readonly disks = [0, 1, 2, 3, 4, 5, 6, 7];
}
