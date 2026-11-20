import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type ReadoutTone = 'ink' | 'gold';

const TONES: Record<ReadoutTone, string> = {
  ink: 'text-ink',
  gold: 'text-gold-ink',
};

/**
 * A value the product produced, in a frame of its own, with whatever acts on it at its right.
 *
 * Not a field: nothing here is typed, so the frame is flat rather than a well. Drawing such a value
 * as an inert field says it could be edited once whatever governs it changes, which is not true of
 * any of them.
 */
@Component({
  selector: 'nc-readout',
  template: `
    <div [class]="boxClass()">
      <span [class]="valueClass()">{{ value() }}</span>
      <ng-content />
    </div>
  `,
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReadoutComponent {
  readonly value = input('');
  readonly tone = input<ReadoutTone>('ink');
  /** `md` is the box a value gets to itself; `sm` sits inside a row that has other things in it. */
  readonly size = input<'sm' | 'md'>('md');

  protected readonly boxClass = computed(() =>
    [
      'flat-sm bevel-edge-line-strong bevel-fill-inset flex items-center',
      this.size() === 'sm'
        ? 'min-h-(--nc-h-sm) gap-0.75 px-1'
        : 'min-h-(--nc-h-lg) gap-1.25 px-1.5',
    ].join(' '),
  );

  protected readonly valueClass = computed(() =>
    [
      'flex-1 font-mono tracking-strip',
      this.size() === 'sm' ? 'text-meta' : 'text-small',
      TONES[this.tone()],
    ].join(' '),
  );
}
