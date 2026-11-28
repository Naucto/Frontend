import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';

/** What a change does to the thing it marks. */
export type ChangeKind = 'NEW' | 'EDIT' | 'DELETED';

const TONE: Record<ChangeKind, string> = {
  NEW: 'bg-jade text-on-accent',
  EDIT: 'bg-orange text-on-accent',
  DELETED: 'bg-hot text-on-hot',
};

/**
 * The kind's sign in the LCD face, as the design sets it: the face draws its own `+`, `~` and `−`
 * on its pixel grid, which is what makes the chip read as one of the editor's characters.
 */
const SIGN = { NEW: '+', EDIT: '~', DELETED: '\u2212' } as const;

/**
 * A change, marked where it is: a square holding `+`, `~` or `−` in the kind's colour, or the
 * kind's word with `word`. Its corners are cut a kit pixel deep, as a bevel's are, since a square
 * with corners of its own beside the kit's frames reads as a second system.
 *
 * The colours mean the kind and nothing else: jade is new, orange is changed, hot is gone. Gold
 * stays the kit's selection and never says "changed".
 */
@Component({
  selector: 'nc-change-chip',
  template: '<span [textContent]="word() ? label() || kind() : sign()"></span>',
  host: {
    '[class]': 'classes()',
    '[attr.role]': '"img"',
    '[attr.aria-label]': 'label() || kind()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChangeChipComponent {
  readonly kind = input.required<ChangeKind>();
  /** The kind's word (NEW, EDIT, DELETED) rather than its glyph. */
  readonly word = input(false, { transform: booleanAttribute });
  /** Read aloud and, with `word`, written in place of the kind: the catalogue's word for it. */
  readonly label = input('');
  /** The square of a tight strip: 16 rather than 22. */
  readonly small = input(false, { transform: booleanAttribute });
  protected readonly sign = computed(() => SIGN[this.kind()]);
  protected readonly classes = computed(() => {
    const shape = this.word()
      ? 'h-[24px] px-[6px] text-[10px] tracking-[0.08em] uppercase'
      : this.small()
        ? 'size-[16px] text-[11px]'
        : 'size-[22px] text-label';
    return `pixel-cut inline-flex shrink-0 items-center justify-center whitespace-nowrap font-mono leading-none ${shape} ${TONE[this.kind()]}`;
  });
}
