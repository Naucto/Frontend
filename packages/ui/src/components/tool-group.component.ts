import {
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  input,
  model,
  viewChildren,
} from '@angular/core';

import { type IconName } from '../icons/paths';
import { IconComponent, type IconSize } from './icon.component';
import { TooltipDirective } from './tooltip.directive';

export interface ToolItem<T extends string = string> {
  value: T;
  icon: IconName;
  label: string;
  /** Keyboard shortcut shown in the tooltip. */
  key?: string;
}

/** Icon toolbar where only the active tool keeps its label (PEN · fill · line · …). */
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
  /**
   * The glyph step, which the density decides and CSS cannot carry: this is an attribute on an
   * SVG, not a length, and the legal steps are halves and doubles of the 24 grid the glyphs are
   * drawn on. A bar at the big density takes 24; there is no rung between.
   */
  readonly iconSize = input<IconSize>(12);

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
    let next: number;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = (index + 1) % items.length;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next = (index - 1 + items.length) % items.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = items.length - 1;
        break;
      default:
        return;
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
