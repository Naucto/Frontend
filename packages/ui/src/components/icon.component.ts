import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { ICON_PATHS, type IconName } from '../icons/paths';
import { glyphRendering } from '../icons/rendering';

export type IconSize = 12 | 24 | 48;

@Component({
  selector: 'nc-icon',
  templateUrl: './icon.component.html',
  host: { class: 'inline-flex shrink-0 items-center justify-center leading-none' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IconComponent {
  readonly name = input.required<IconName>();
  readonly size = input<IconSize>(24);
  protected readonly pathData = computed(() => ICON_PATHS[this.name()]);
  protected readonly rendering = glyphRendering;
}
