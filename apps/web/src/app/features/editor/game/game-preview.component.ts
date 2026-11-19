import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { ChipComponent, LabelComponent } from '@naucto/ui';

import { WorkSessionService } from '../work-session/work-session.service';

/**
 * The GAME tab of a read-only session: what the game says about itself, to read. The real tab is
 * where a cover is uploaded, people are invited and the game is deleted, none of which a preview
 * may offer, so it is replaced as a whole.
 */
@Component({
  selector: 'nc-game-preview',
  imports: [RouterLink, TranslocoDirective, ChipComponent, LabelComponent],
  templateUrl: './game-preview.component.html',
  host: { class: 'block h-full overflow-auto' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GamePreviewComponent {
  protected readonly session = inject(WorkSessionService);
}
