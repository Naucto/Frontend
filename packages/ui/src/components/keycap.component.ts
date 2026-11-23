import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';

/** `md` stands in a line of text; `sm` is the hint a well carries at its end. */
export type KeycapSize = 'sm' | 'md';

const SIZE: Record<KeycapSize, string> = {
  sm: 'h-(--nc-h-sm) min-w-[28px] px-[3px]',
  md: 'h-(--nc-h-md) min-w-[36px] px-1.5',
};

const EDGE = {
  idle: 'bevel-edge-key-edge',
  waiting: 'bevel-edge-gold',
} as const;

/**
 * Keyboard / gamepad binding chip (ARROWS, Z, ESC, D-PAD): a key seen from the front, lit along
 * its top and two pixels deep at its foot. The legend sits on the face, above the foot.
 * `waiting` rings it in gold: the key a binding is still to be pressed on.
 */
@Component({
  selector: 'nc-keycap',
  template: '<ng-content />',
  host: {
    class:
      'flat-sm bevel-fill-key-face inline-flex items-center justify-center gap-0.5 pb-[3px] font-mono text-meta text-key-ink uppercase shadow-[inset_0_3px_0_var(--color-key-hl),inset_0_-6px_0_var(--color-key-side)]',
    '[class]': 'box()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KeycapComponent {
  readonly size = input<KeycapSize>('md');
  readonly waiting = input(false, { transform: booleanAttribute });
  protected readonly box = computed(
    () => `${SIZE[this.size()]} ${this.waiting() ? EDGE.waiting : EDGE.idle}`,
  );
}
