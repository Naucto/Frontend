import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { KEYS } from '@naucto/engine';
import { type TabItem, TabsComponent } from '@naucto/ui';

import { ySignal, yTextField } from '../../../shared/yjs/y-signal';
import { parseTags } from '../state/project-tags';
import { WorkSessionService } from '../work-session/work-session.service';
import { ClipRecorder } from './clip-recorder.service';
import { DetailsComponent } from './details.component';
import { DiskBenchComponent } from './disk-bench.component';
import { InputsComponent } from './inputs.component';
import { PublishingComponent } from './publishing.component';

type GameView = 'details' | 'disk' | 'inputs';

/**
 * GAME tab: what this thing is, how its disk looks and what plays it, beside the Publishing
 * sidebar that holds the running game.
 */
@Component({
  selector: 'nc-game-tab-page',
  imports: [
    TranslocoDirective,
    TabsComponent,
    DetailsComponent,
    DiskBenchComponent,
    InputsComponent,
    PublishingComponent,
  ],
  // One recorder for the tab: the Details view starts and stops it, the sidebar shows it running.
  providers: [ClipRecorder],
  templateUrl: './game-tab.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class GameTabPage {
  private readonly session = inject(WorkSessionService);
  private readonly transloco = inject(TranslocoService);

  protected readonly view = signal<GameView>('details');
  protected readonly name = yTextField(
    this.session.game,
    this.session.doc.getText(KEYS.projectName),
  );
  protected readonly summary = yTextField(
    this.session.game,
    this.session.doc.getText(KEYS.shortDescription),
  );
  protected readonly description = yTextField(
    this.session.game,
    this.session.doc.getText(KEYS.longDescription),
  );
  private readonly tagsRaw = yTextField(
    this.session.game,
    this.session.doc.getText(KEYS.projectTags),
  );
  protected readonly tags = computed(() => parseTags(this.tagsRaw()));
  private readonly actionCount = ySignal(
    () => this.session.game.actions.length,
    (cb) => this.session.game.onActionsChange(cb),
  );
  protected readonly views = computed<TabItem<GameView>[]>(() => [
    { value: 'details', label: this.transloco.translate('editor.game.views.details') },
    { value: 'disk', label: this.transloco.translate('editor.game.views.disk') },
    {
      value: 'inputs',
      label: this.transloco.translate('editor.game.views.inputs'),
      badge: this.actionCount(),
    },
  ]);

  protected setTags(tags: string[]): void {
    this.tagsRaw.set(JSON.stringify(tags));
  }
}
