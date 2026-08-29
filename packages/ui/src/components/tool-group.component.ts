import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';

import { type IconName } from '../icons/paths';
import { IconComponent } from './icon.component';
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
  template: `
    <div
      role="radiogroup"
      [attr.aria-label]="label()"
      class="inline-flex gap-0.5 rounded-sm border border-line bg-inset p-0.5"
    >
      @for (item of items(); track item.value) {
        <button
          type="button"
          role="radio"
          [attr.aria-checked]="item.value === value()"
          [attr.aria-label]="item.label"
          [ncTooltip]="item.key ? item.label + ' · ' + item.key : item.label"
          (click)="value.set(item.value)"
          class="inline-flex h-[26px] w-[30px] cursor-pointer items-center justify-center gap-1.5 rounded-xs px-0 text-ink-3 transition-colors duration-100 hover:text-ink aria-checked:w-auto aria-checked:bg-gold aria-checked:px-1.5 aria-checked:text-on-accent"
        >
          <nc-icon [name]="item.icon" [size]="12" />
          @if (item.value === value()) {
            <span class="font-mono text-label uppercase tracking-button">{{ item.label }}</span>
          }
        </button>
      }
    </div>
  `,
  host: { class: 'inline-flex' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToolGroupComponent<T extends string = string> {
  readonly items = input.required<readonly ToolItem<T>[]>();
  readonly value = model<T>();
  readonly label = input('Tools');
}
