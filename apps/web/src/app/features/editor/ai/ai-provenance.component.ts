import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { unwrap } from '@app/core/api/api-errors';
import { TranslocoDirective } from '@jsverse/transloco';
import {
  aiControllerDeclare,
  aiControllerProvenance,
  type AiProvenanceResponseDto,
} from '@naucto/api-client';
import { AI_CATEGORIES, type AiCategory } from '@naucto/engine';
import {
  ButtonDirective,
  CheckboxComponent,
  FieldComponent,
  InputDirective,
  NoticeComponent,
} from '@naucto/ui';

/**
 * The project's AI history. Categories only ever grow: they say AI tools were used while the game
 * was made, not that what stands today was generated.
 */
@Component({
  selector: 'nc-ai-provenance',
  imports: [
    FormsModule,
    TranslocoDirective,
    ButtonDirective,
    CheckboxComponent,
    FieldComponent,
    InputDirective,
    NoticeComponent,
  ],
  template: `
    <div *transloco="let t">
      <p class="text-meta text-ink-2">{{ t('ai.badgeHelp') }}</p>
      @if (error()) {
        <nc-notice tone="danger" role="alert">{{ error() }}</nc-notice>
      }
      @if (info(); as p) {
        <p class="mt-1 text-ui" data-testid="ai-categories">
          @for (category of p.categories; track category) {
            <span class="label mr-1">{{ t('ai.category.' + category) }}</span>
          } @empty {
            <span class="text-meta text-ink-3">{{ t('ai.noCategories') }}</span>
          }
        </p>
        <h3 class="mt-1.5 label">{{ t('ai.declareTitle') }}</h3>
        <p class="text-meta text-ink-3">{{ t('ai.declareHelp') }}</p>
        <div class="mt-0.5 flex flex-wrap gap-1.5">
          @for (category of categories; track category) {
            <nc-checkbox
              [checked]="chosen().includes(category)"
              (checkedChange)="toggle(category, $event)"
            >
              {{ t('ai.category.' + category) }}
            </nc-checkbox>
          }
        </div>
        <nc-field [label]="t('ai.declareNote')" for="ai-declare-note" class="mt-1">
          <input ncInput id="ai-declare-note" [(ngModel)]="note" maxlength="1000" />
        </nc-field>
        <button
          ncButton
          variant="secondary"
          size="sm"
          class="mt-1"
          [disabled]="busy() || !chosen().length"
          (click)="declare()"
        >
          {{ t('ai.declare') }}
        </button>
        <h3 class="mt-1.5 label">{{ t('ai.history') }}</h3>
        <ul class="text-meta">
          @for (item of p.applied; track item.id) {
            <li>{{ item.title }} · {{ t('ai.status.' + item.status) }}</li>
          }
          @for (item of p.declarations; track item.id) {
            <li>{{ t('ai.declared') }} · {{ item.categories.join(', ') }} · {{ item.note }}</li>
          }
        </ul>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AiProvenanceComponent {
  readonly projectId = input.required<number>();
  protected readonly categories = AI_CATEGORIES;
  protected readonly info = signal<AiProvenanceResponseDto | null>(null);
  protected readonly chosen = signal<AiCategory[]>([]);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected note = '';

  constructor() {
    queueMicrotask(() => void this.refresh());
  }

  protected toggle(category: AiCategory, on: boolean): void {
    this.chosen.update((list) => (on ? [...list, category] : list.filter((c) => c !== category)));
  }

  private async refresh(): Promise<void> {
    try {
      this.info.set(
        unwrap(await aiControllerProvenance({ path: { projectId: this.projectId() } })),
      );
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : String(error));
    }
  }

  protected async declare(): Promise<void> {
    this.busy.set(true);
    try {
      unwrap(
        await aiControllerDeclare({
          path: { projectId: this.projectId() },
          body: { categories: this.chosen(), note: this.note.trim() },
        }),
      );
      this.chosen.set([]);
      this.note = '';
      await this.refresh();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : String(error));
    } finally {
      this.busy.set(false);
    }
  }
}
