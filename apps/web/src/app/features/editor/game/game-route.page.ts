import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { WorkSessionService } from '../work-session/work-session.service';
import { GamePreviewComponent } from './game-preview.component';
import GameTabPage from './game-tab.page';

/**
 * What the GAME route shows: the tab itself, or its read-only summary in a preview. Chosen here
 * so the real tab, with everything it can change, is never built in a session that changes
 * nothing.
 */
@Component({
  selector: 'nc-game-route-page',
  imports: [GamePreviewComponent, GameTabPage],
  template: `
    @if (session.readOnly()) {
      <nc-game-preview />
    } @else {
      <nc-game-tab-page />
    }
  `,
  host: { class: 'contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class GameRoutePage {
  protected readonly session = inject(WorkSessionService);
}
