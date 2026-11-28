import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { Decision, MapAreaChange } from '@naucto/engine';

import { DiffStore } from './diff.store';
import { HunkActionsComponent } from './hunk-actions.component';

interface Tile {
  x: number;
  y: number;
  look: 'added' | 'changed' | 'removed';
}

interface Area {
  item: MapAreaChange;
  decision: Decision;
  selected: boolean;
  tiles: Tile[];
}

/**
 * The changes of one map, laid over its canvas at the canvas's scale: each area outlined, dashed
 * until it is selected; a tile added inset in jade, one changed inset in orange, one removed
 * hatched in hot over what it was. A click on an area selects it and opens its accept and reject
 * beside it; a decided area is drawn as it was decided, with no mark.
 */
@Component({
  selector: 'nc-map-diff-layer',
  imports: [HunkActionsComponent],
  templateUrl: './map-diff-layer.component.html',
  host: { class: 'pointer-events-none absolute inset-0 z-10 block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapDiffLayerComponent {
  readonly mapId = input.required<string>();
  /** One tile on the canvas, in CSS pixels. */
  readonly tilePx = input.required<number>();
  protected readonly diff = inject(DiffStore);

  protected readonly areas = computed<Area[]>(() =>
    this.diff
      .itemsOf('map')
      .filter(
        (item): item is MapAreaChange => item.type === 'map-area' && item.mapId === this.mapId(),
      )
      .map((item) => {
        const tiles: Tile[] = [];
        for (let i = 0; i < item.cells.length; i += 4) {
          const before = item.cells[i + 2] ?? 0;
          const after = item.cells[i + 3] ?? 0;
          tiles.push({
            x: item.cells[i] ?? 0,
            y: item.cells[i + 1] ?? 0,
            look: before === 0 ? 'added' : after === 0 ? 'removed' : 'changed',
          });
        }
        return {
          item,
          decision: this.diff.decisions().get(item.key) ?? 'pending',
          selected: this.diff.currentKey() === item.key,
          tiles,
        };
      }),
  );

  protected readonly selected = computed(
    () => this.areas().find((area) => area.selected && area.decision === 'pending') ?? null,
  );

  protected readonly tileLook: Record<Tile['look'], string> = {
    added: 'shadow-[inset_0_0_0_2px_var(--nc-jade)]',
    changed: 'shadow-[inset_0_0_0_2px_var(--nc-orange)]',
    removed: 'pixel-hatch',
  };

  protected select(area: Area, event: Event): void {
    event.stopPropagation();
    this.diff.currentKey.set(area.item.key);
  }
}
