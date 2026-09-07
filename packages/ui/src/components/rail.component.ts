import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';

import { type IconName } from '../icons/paths';
import { IconComponent } from './icon.component';

export interface RailItem<T extends string> {
  value: T;
  label: string;
  icon: IconName;
  /** Optional router link; when set the item renders as an anchor. */
  link?: string;
}

/** Vertical tool rail (GAME / CODE / ART / MAP / SOUND / NET): 80px wide, the active item raised and barred in gold. */
@Component({
  selector: 'nc-rail',
  imports: [IconComponent],
  template: `
    <nav [attr.aria-label]="label()" class="flex h-full w-full flex-col">
      @for (it of items(); track it.value) {
        <button
          type="button"
          [attr.aria-current]="it.value === value() ? 'page' : null"
          [attr.title]="it.label"
          (click)="value.set(it.value)"
          class="relative flex h-[60px] w-full cursor-pointer flex-col items-center justify-center gap-[6px] text-ink-4 transition-colors duration-100 hover:text-ink aria-[current]:bg-raised aria-[current]:text-gold-ink"
        >
          <!-- One conditional class, not a static transparent plus a gold binding: with both
               present the later rule in the stylesheet wins and the bar never painted. -->
          <span
            class="absolute top-0 bottom-0 left-0 w-[3px] transition-colors duration-100"
            [class]="it.value === value() ? 'bg-gold' : 'bg-transparent'"
          ></span>
          <nc-icon [name]="it.icon" [size]="24" />
          <span class="font-mono text-[9px] uppercase tracking-wide">{{ it.label }}</span>
        </button>
      }
    </nav>
  `,
  // The host owns the column: its headroom, its ground, and its seam. Nothing inside adds any of
  // the three — a nav is only as tall as its buttons, so a rule drawn on it stops where they do.
  // And the seam is the rail's rather than the workspace's: a rail is the edge of what sits beside
  // it, which is not a thing each caller should have to remember to draw.
  host: { class: 'block h-full border-r border-line bg-panel pt-1' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RailComponent<T extends string = string> {
  readonly items = input.required<readonly RailItem<T>[]>();
  readonly value = model<T>();
  readonly label = input('Tools');
}
