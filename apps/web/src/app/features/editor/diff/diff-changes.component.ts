import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import type { ChangeItem, Decision } from '@naucto/engine';
import { ChangeChipComponent, SectionComponent } from '@naucto/ui';

import { DiffStore } from './diff.store';
import { HunkActionsComponent } from './hunk-actions.component';

interface Row {
  item: ChangeItem;
  /** The short tag of its chip: a letter for an area, a number for a sprite or a slot. */
  tag: string;
  title: string;
  detail: string;
  decision: Decision;
  current: boolean;
}

const pad = (value: number, size = 3): string => String(value).padStart(size, '0');

/**
 * The Changes section at the top of an editor's panel: every change of what the editor shows,
 * a click on one selecting it and showing it where it is, and its own accept and reject. Its tag
 * is gold while waiting, jade once kept and hot once refused; comparing paints it orange and
 * decides nothing.
 */
@Component({
  selector: 'nc-diff-changes',
  imports: [TranslocoDirective, ChangeChipComponent, HunkActionsComponent, SectionComponent],
  templateUrl: './diff-changes.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DiffChangesComponent {
  readonly items = input.required<readonly ChangeItem[]>();
  protected readonly diff = inject(DiffStore);
  private readonly transloco = inject(TranslocoService);

  protected readonly rows = computed<Row[]>(() => {
    let area = 0;
    return this.items().map((item) => {
      const say = (key: string, params?: Record<string, unknown>): string =>
        this.transloco.translate(`editor.diff.item.${key}`, params);
      const base = {
        item,
        decision: this.diff.decisions().get(item.key) ?? 'pending',
        current: this.diff.currentKey() === item.key,
      };
      switch (item.type) {
        case 'map-area':
          area += 1;
          return {
            ...base,
            tag: String.fromCharCode(64 + Math.min(area, 26)),
            title: say('area', { x: item.bounds.x, y: item.bounds.y }),
            detail: say('tiles', { n: item.cells.length / 4, w: item.bounds.w, h: item.bounds.h }),
          };
        case 'map-size':
        case 'sheet-size':
          return {
            ...base,
            tag: '#',
            title: say(item.type === 'map-size' ? 'mapSize' : 'sheetSize'),
            detail: `${String(item.before.width)} × ${String(item.before.height)} → ${String(item.after.width)} × ${String(item.after.height)}`,
          };
        case 'map-name':
        case 'sheet-name':
          return {
            ...base,
            tag: '#',
            title: say(item.type === 'map-name' ? 'mapName' : 'sheetName'),
            detail: `${item.before} → ${item.after}`,
          };
        case 'action': {
          const action = item.after ?? item.before;
          return {
            ...base,
            tag: 'I',
            title: action?.label ?? item.id,
            detail: say(`kind${item.kind}`),
          };
        }
        case 'map':
        case 'sheet':
          return {
            ...base,
            tag: '#',
            title: item.name || item.id,
            detail: say(`kind${item.kind}`),
          };
        case 'sheet-cell':
          return {
            ...base,
            tag: pad(item.sprite),
            title: say('sprite', { n: pad(item.sprite) }),
            detail: say(`kind${item.kind}`),
          };
        case 'sheet-flags':
          return {
            ...base,
            tag: 'F',
            title: say('flags', { n: pad(item.sprite) }),
            detail: say('flagBits', { before: item.before, after: item.after }),
          };
        case 'palette':
          return {
            ...base,
            tag: pad(item.index, 2),
            title: say('colour', { n: item.index }),
            detail: `${item.before} → ${item.after}`,
          };
        case 'net':
          return {
            ...base,
            tag: 'N',
            title: item.path || say('root'),
            detail: say(`kind${item.kind}`),
          };
        case 'sound':
          return {
            ...base,
            tag: item.part.slice(0, 1).toUpperCase(),
            title: item.name,
            detail: say(`part.${item.part}`),
          };
        default:
          return { ...base, tag: '~', title: item.key, detail: say(`kind${item.kind}`) };
      }
    });
  });

  protected tone(row: Row): string {
    if (this.diff.mode() === 'compare') {
      return 'bg-orange text-on-accent';
    }
    if (row.decision === 'ok') {
      return 'bg-jade text-on-accent';
    }
    return row.decision === 'no' ? 'bg-hot text-on-hot' : 'bg-gold text-on-accent';
  }

  protected select(row: Row): void {
    this.diff.currentKey.set(row.item.key);
  }
}
