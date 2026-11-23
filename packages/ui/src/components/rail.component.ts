import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';

import { type IconName } from '../icons/glyphs';
import { IconComponent } from './icon.component';
import { type PresenceDot, PresenceDotsComponent } from './presence-dots.component';

export interface RailItem<T extends string> {
  value: T;
  label: string;
  icon: IconName;
  peers?: readonly PresenceDot[];
}

/**
 * A tab of the rail is a small frame open on its right, where the workspace is. The chosen one
 * comes through the rail's rule into it and reaches out to the left edge; an idle one reaches a
 * pixel under the pointer, in three held steps.
 */
const TAB =
  'flat-sm bevel-open-r relative -mt-[3px] flex h-[84px] cursor-pointer flex-col items-center justify-center gap-[6px] ' +
  'first:mt-0 focus-visible:outline-offset-[-6px] [transition:margin_120ms_steps(3),color_180ms]';
const OFF =
  `${TAB} mr-[3px] bevel-edge-line-strong bevel-fill-panel text-ink-4 ` +
  'hover:z-1 hover:-ml-[3px] hover:bevel-lit hover:text-active-ink';
const ON =
  `${TAB} -ml-[6px] bevel-edge-active-ink bevel-hi-line-strong bevel-lo-line-strong ` +
  'bevel-fill-raised text-active-ink';

/** Vertical tool rail: tabs that open on their right edge, into the workspace beside them. */
@Component({
  selector: 'nc-rail',
  imports: [IconComponent, PresenceDotsComponent],
  templateUrl: './rail.component.html',
  // The rule is the host's: the nav is only as tall as its buttons, and a rule drawn on it would
  // stop where they do. It stops a pixel short of each end, as the side of a frame does, and the
  // host is positioned so the chosen tab is drawn over the edge of a frame pulled under the rule.
  host: {
    class:
      'relative block h-full pt-[6px] pl-[6px] ' +
      '[background:linear-gradient(var(--nc-line-strong)_0_0)_right/3px_calc(100%-6px)_no-repeat_var(--nc-panel)]',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RailComponent<T extends string = string> {
  readonly items = input.required<readonly RailItem<T>[]>();
  readonly value = model<T>();
  readonly label = input('Tools');

  protected readonly offClass = OFF;
  protected readonly onClass = ON;
}
