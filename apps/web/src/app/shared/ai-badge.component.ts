import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { AI_CATEGORIES, type AiCategory } from '@naucto/engine';
import { ChipComponent } from '@naucto/ui';

/**
 * AI-ASSISTED, and on the game page the parts it touched. The categories come from the release a
 * player is looking at, and they record history: what AI tools were used for while the game was
 * made, not a claim about what stands in it now.
 */
@Component({
  selector: 'nc-ai-badge',
  imports: [TranslocoDirective, ChipComponent],
  template: `
    <ng-container *transloco="let t">
      @if (categories().length) {
        <span class="inline-flex flex-wrap items-center gap-0.5" data-testid="ai-badge">
          <nc-chip [attr.title]="t('ai.badgeHelp')">{{ t('ai.badge') }}</nc-chip>
          @if (detailed()) {
            <span class="text-meta text-ink-2">
              {{ t('ai.badgeDetail', { categories: labels(t) }) }}
            </span>
          }
        </span>
      }
    </ng-container>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AiBadgeComponent {
  readonly project = input.required<{ aiCategories?: readonly string[] | null } | null>();
  /** Name each category beside the chip, as the game page does; cards keep the chip alone. */
  readonly detailed = input(false, { transform: booleanAttribute });

  protected readonly categories = computed<AiCategory[]>(() =>
    (this.project()?.aiCategories ?? []).filter((category): category is AiCategory =>
      AI_CATEGORIES.some((known) => known === category),
    ),
  );

  protected labels(t: (key: string) => string): string {
    return this.categories()
      .map((category) => t(`ai.category.${category}`))
      .join(' · ');
  }
}
