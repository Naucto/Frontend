import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import {
  ButtonDirective,
  NoticeComponent,
  SectionComponent,
  SegmentedComponent,
  type SegmentOption,
} from '@naucto/ui';

import { AiJobsComponent } from '../ai/ai-jobs.component';
import { AiProposalsComponent } from '../ai/ai-proposals.component';
import { AiProvenanceComponent } from '../ai/ai-provenance.component';
import { AssetCatalogComponent } from '../ai/asset-catalog.component';
import type { WorkSessionService } from '../work-session/work-session.service';

type Panel = 'changes' | 'catalog' | 'jobs' | 'provenance';

/**
 * The assistant, where configuration belongs: in the game's own settings, beside publishing and
 * lineage, rather than behind a modal that covered the editor.
 *
 * Connecting, sharing and disconnecting live on the session, not here, so closing this section
 * does not leave the assistant blind — which is what used to happen, and why the context kept
 * expiring the moment the dialog was dismissed.
 */
@Component({
  selector: 'nc-assistant-section',
  imports: [
    TranslocoDirective,
    ButtonDirective,
    NoticeComponent,
    SectionComponent,
    SegmentedComponent,
    AiProposalsComponent,
    AssetCatalogComponent,
    AiJobsComponent,
    AiProvenanceComponent,
  ],
  template: `
    <div *transloco="let t">
      <nc-section banded [title]="t('ai.connected')">
        @if (connected()) {
          <p class="text-meta text-ink-3">{{ t('ai.connectedHint') }}</p>
          @if (token()) {
            <code class="mt-0.5 block font-mono text-meta break-all select-all">{{ token() }}</code>
          }
          <div class="mt-1 flex flex-wrap gap-1">
            <button ncButton variant="ghost" size="sm" [disabled]="busy()" (click)="rotate()">
              {{ t('ai.connect') }}
            </button>
            <button ncButton variant="ghost" size="sm" [disabled]="busy()" (click)="disconnect()">
              {{ t('ai.revoke') }}
            </button>
          </div>
        } @else {
          <p class="text-meta text-ink-3">{{ t('ai.disconnectedHint') }}</p>
          <button
            ncButton
            variant="secondary"
            size="sm"
            class="mt-1"
            [disabled]="busy()"
            (click)="connect()"
          >
            {{ t('ai.connect') }}
          </button>
        }
        @if (error()) {
          <nc-notice tone="danger" role="alert" class="mt-1">{{ error() }}</nc-notice>
        }
      </nc-section>

      <nc-segmented
        class="mt-1.5"
        [options]="panels()"
        [value]="panel()"
        (valueChange)="panel.set($event ?? 'changes')"
        [label]="t('ai.title')"
      />

      <div class="mt-1.5">
        @switch (panel()) {
          @case ('changes') {
            <nc-ai-proposals [session]="session()" />
          }
          @case ('catalog') {
            <nc-asset-catalog [game]="session().game" />
          }
          @case ('jobs') {
            <nc-ai-jobs [projectId]="session().id" />
          }
          @case ('provenance') {
            <nc-ai-provenance [projectId]="session().id" />
          }
        }
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssistantSection {
  readonly session = input.required<WorkSessionService>();
  private readonly i18n = inject(TranslocoService);

  protected readonly panel = signal<Panel>('changes');
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected readonly token = computed(() => this.session().aiToken());
  protected readonly connected = computed(() => !!this.session().aiToken());

  protected readonly panels = computed<SegmentOption<Panel>[]>(() => [
    { value: 'changes', label: this.i18n.translate('ai.panel.changes') },
    { value: 'catalog', label: this.i18n.translate('ai.panel.catalog') },
    { value: 'jobs', label: this.i18n.translate('ai.panel.jobs') },
    { value: 'provenance', label: this.i18n.translate('ai.panel.provenance') },
  ]);

  protected async connect(): Promise<void> {
    await this.run(() => this.session().connectAi());
  }

  protected async rotate(): Promise<void> {
    await this.run(() => this.session().connectAi());
  }

  protected async disconnect(): Promise<void> {
    await this.run(() => this.session().disconnectAi());
  }

  private async run(action: () => Promise<void>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await action();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : String(error));
    } finally {
      this.busy.set(false);
    }
  }
}
