import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';

import { glyphPath } from '../icons/glyph-path';
import { ICON_GLYPHS, type IconName } from '../icons/glyphs';
import { glyphRendering } from '../icons/rendering';

/** 18 beside words, 24 standing alone. A glyph has a drawing for each and is never scaled. */
export type IconSize = 18 | 24;

/**
 * A glyph of the kit's set, on a grid whose cell is one kit pixel. At 18 it is the drawing made
 * for six cells, which sits beside words: a button's leading icon, a stat, a menu row. At 24 it
 * is the one made for eight, which stands alone: the top bar, the rail, an empty state, an
 * icon-only button of 40 or taller. A control's bevel keeps one pixel clear of the glyph's box,
 * so a button of 36 holds an icon of 18 and nothing larger, and one of 30 an `nc-mark`.
 */
@Component({
  selector: 'nc-icon',
  templateUrl: './icon.component.html',
  host: { class: 'inline-flex shrink-0 items-center justify-center leading-none' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IconComponent {
  readonly name = input.required<IconName>();
  readonly size = input<IconSize>(18);
  /**
   * The drawing at twice its size, two kit pixels a cell. One place asks for it: the Play mark
   * over a game's idle screen, a picture wide enough that 24 reads as a speck. `pixel:check`
   * names that place and fails on any other.
   */
  readonly doubled = input(false, { transform: booleanAttribute });
  protected readonly side = computed(() => this.size() * (this.doubled() ? 2 : 1));
  protected readonly viewBox = computed(() => `0 0 ${String(this.size())} ${String(this.size())}`);
  protected readonly pathData = computed(() =>
    glyphPath(ICON_GLYPHS[this.size()][this.name()], this.size() / 3),
  );
  protected readonly rendering = glyphRendering;
}
