import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';

import { type IconName } from '../icons/paths';
import { IconComponent } from './icon.component';

export interface RailItem<T extends string> {
  value: T;
  label: string;
  icon: IconName;
}

/** Vertical tool rail: the active item raised and barred in gold. */
@Component({
  selector: 'nc-rail',
  imports: [IconComponent],
  templateUrl: './rail.component.html',
  // The border sits on the host: the nav is only as tall as its buttons, and a rule drawn on it
  // would stop where they do.
  host: { class: 'block h-full border-r border-line bg-panel pt-1' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RailComponent<T extends string = string> {
  readonly items = input.required<readonly RailItem<T>[]>();
  readonly value = model<T>();
  readonly label = input('Tools');
}
