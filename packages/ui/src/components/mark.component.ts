import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { glyphPath } from '../icons/glyph-path';
import { MARK_GLYPHS, type MarkName } from '../icons/glyphs';
import { glyphRendering } from '../icons/rendering';

/**
 * A chevron, a cross, a check, an arrow or a key's legend at the size of a control's corner: 15px,
 * five kit pixels across. It has one size because it is drawn for it; where there is room for 24px, the
 * glyph is an `nc-icon`.
 */
@Component({
  selector: 'nc-mark',
  templateUrl: './mark.component.html',
  host: { class: 'inline-flex shrink-0 items-center justify-center leading-none' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MarkComponent {
  readonly name = input.required<MarkName>();
  protected readonly pathData = computed(() => glyphPath(MARK_GLYPHS[this.name()], 5));
  protected readonly rendering = glyphRendering;
}
