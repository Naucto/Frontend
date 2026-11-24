import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import type { CollectionVisibility } from '@naucto/api-client';
import { ChipComponent, type ChipTone } from '@naucto/ui';

const TONES: Record<CollectionVisibility, ChipTone> = {
  PUBLIC: 'jade',
  UNLISTED: 'sky',
  PRIVATE: 'neutral',
};

/** Who can open a collection, as a badge. */
@Component({
  selector: 'nc-visibility-chip',
  imports: [TranslocoDirective, ChipComponent],
  template: `
    <nc-chip *transloco="let t" wash [tone]="tone()">
      {{ t('collections.visibility.' + visibility()) }}
    </nc-chip>
  `,
  host: { class: 'inline-flex flex-none' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VisibilityChipComponent {
  readonly visibility = input.required<CollectionVisibility>();
  protected readonly tone = computed(() => TONES[this.visibility()]);
}
