import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type ReadoutTone = 'ink' | 'gold';

const TONES: Record<ReadoutTone, string> = {
  ink: 'text-ink',
  gold: 'text-gold-ink',
};

/**
 * A value the product produced, in a well of its own, with whatever acts on it at its right.
 *
 * Not a field: nothing here is typed. Drawing such a value as an inert field says it could be
 * edited once whatever governs it changes, which is not true of any of them.
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
      'flex items-center rounded-sm border border-line-strong bg-inset',
      this.size() === 'sm' ? 'gap-0.75 px-1 py-0.5' : 'gap-1.25 px-[11px] py-[9px]',
    ].join(' '),
  );

  protected readonly valueClass = computed(() =>
    [
      'flex-1 font-mono tracking-strip',
      this.size() === 'sm' ? 'text-meta' : 'text-[14px]',
      TONES[this.tone()],
    ].join(' '),
  );
}
