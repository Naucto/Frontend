import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  input,
  model,
  viewChildren,
} from '@angular/core';

import { type IconName } from '../icons/glyphs';
import { closedBy } from './disabled-scope.directive';
import { IconComponent } from './icon.component';
import { CELL, CELL_ON, joined } from './selection-styles';
import { TooltipDirective } from './tooltip.directive';

export interface ToolItem<T extends string = string> {
  value: T;
  icon: IconName;
  label: string;
  /** Keyboard shortcut shown in the tooltip. */
  key?: string;
  /** Unavailable where the others are not: a tool that writes, on something only looked at. */
  disabled?: boolean;
}

const TOOL = `${CELL} ${CELL_ON.primary} group h-(--nc-h-lg) min-w-[44px] font-ui uppercase text-ink-3 data-on:cursor-default`;

/** Icon toolbar where only the active tool opens onto its label (PEN · fill · line · …). */
@Component({
  selector: 'nc-tool-group',
  imports: [IconComponent, TooltipDirective],
  templateUrl: './tool-group.component.html',
  host: { class: 'inline-flex' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToolGroupComponent<T extends string = string> {
  readonly items = input.required<readonly ToolItem<T>[]>();
  readonly value = model<T>();
  readonly label = input('Tools');
  readonly disabled = input(false, { transform: booleanAttribute });
  protected readonly closed = closedBy(() => this.disabled());

  protected toolClass(first: boolean, last: boolean): string {
    return `${TOOL} ${joined(first, last)}`;
  }

  private readonly radios = viewChildren<ElementRef<HTMLButtonElement>>('radio');

  /** The checked tool is the one tab stop; with nothing checked yet, the first one is. */
  protected tabIndexFor(item: ToolItem<T>, index: number): number {
    if (item.value === this.value()) {
      return 0;
    }
    return this.value() === undefined && index === 0 ? 0 : -1;
  }

  protected onKey(event: KeyboardEvent, index: number): void {
    const items = this.items();
    let from: number;
    let step: number;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        from = index + 1;
        step = 1;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        from = index - 1;
        step = -1;
        break;
      case 'Home':
        from = 0;
        step = 1;
        break;
      case 'End':
        from = items.length - 1;
        step = -1;
        break;
      default:
        return;
    }
    // The first tool that can be taken in that direction, going round once at most.
    let next = -1;
    for (let tried = 0; tried < items.length; tried++) {
      const at = (((from + tried * step) % items.length) + items.length) % items.length;
      if (items[at]?.disabled !== true) {
        next = at;
        break;
      }
    }
    const target = items[next];
    if (!target) {
      return;
    }
    event.preventDefault();
    this.value.set(target.value);
    this.radios()[next]?.nativeElement.focus();
  }
}
