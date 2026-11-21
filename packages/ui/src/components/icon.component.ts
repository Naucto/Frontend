import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { glyphPath } from '../icons/glyph-path';
import { ICON_GLYPHS, type IconName } from '../icons/glyphs';
import { glyphRendering } from '../icons/rendering';

/** 24 beside words, 36 standing alone. A glyph has a drawing for each and is never scaled. */
export type IconSize = 24 | 36;

/**
 * A glyph of the kit's set, on a grid whose cell is one kit pixel. At 24 it is the drawing made
 * for eight cells, which sits beside words: a button's leading icon, a stat, a menu row. At 36 it
 * is the one made for twelve, which stands alone: the top bar, the rail, an empty state. Where 24
 * has no room the glyph is an `nc-mark`.
 */
@Component({
  selector: 'nc-icon',
  templateUrl: './icon.component.html',
  host: { class: 'inline-flex shrink-0 items-center justify-center leading-none' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IconComponent {
  readonly name = input.required<IconName>();
  readonly size = input<IconSize>(24);
  protected readonly viewBox = computed(() => `0 0 ${String(this.size())} ${String(this.size())}`);
  protected readonly pathData = computed(() =>
    glyphPath(ICON_GLYPHS[this.size()][this.name()], this.size() / 3),
  );
  protected readonly rendering = glyphRendering;
}
