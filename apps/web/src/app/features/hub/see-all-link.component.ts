import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { type Params, RouterLink } from '@angular/router';
import { MarkComponent } from '@naucto/ui';

/** The link at the end of a shelf's heading that opens everything the shelf holds. */
@Component({
  selector: 'nc-see-all',
  imports: [RouterLink, MarkComponent],
  templateUrl: './see-all-link.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SeeAllLinkComponent {
  readonly link = input.required<string>();
  readonly queryParams = input<Params | null>(null);
}
