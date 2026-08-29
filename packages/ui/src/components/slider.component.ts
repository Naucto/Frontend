import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  model,
} from '@angular/core';

/**
 * Horizontal value slider with an optional readout (BPM 124, R 255, LATENCY 80 ms).
 *
 * `compact` is the geometry the design uses where the label is a single letter and the groove is
 * what the row is for — the RGB channels in the palette editor. The default columns are sized for
 * a word (LATENCY, OPACITY) and swallow most of a narrow panel when the label is one character.
 */
@Component({
  selector: 'nc-slider',
  template: `
    @if (label()) {
      <span class="label shrink-0" [class]="compact() ? 'w-[16px]' : 'w-[56px]'">
        {{ label() }}
      </span>
    }
    <input
      type="range"
      [min]="min()"
      [max]="max()"
      [step]="step()"
      [value]="value()"
      [disabled]="disabled()"
      [attr.aria-label]="label()"
      (input)="onInput($event)"
      class="nc-range h-[4px] flex-1 cursor-pointer appearance-none rounded-xs disabled:opacity-40"
      [class]="compact() ? 'bg-line-soft' : 'bg-line-strong'"
      [style.--nc-accent]="'var(--nc-' + accent() + ')'"
      [style.--nc-fill]="fill()"
    />
    @if (readout()) {
      <span
        class="shrink-0 text-right font-mono text-meta text-ink-body"
        [class]="compact() ? 'w-[30px]' : 'w-[42px]'"
      >
        {{ readout() }}
      </span>
    }
  `,
  host: { class: 'flex items-center gap-1.5' },
  styles: `
    .nc-range::-webkit-slider-thumb {
      appearance: none;
      width: 6px;
      height: 12px;
      background: var(--nc-accent);
      border-radius: 1px;
    }
    .nc-range::-moz-range-thumb {
      width: 6px;
      height: 12px;
      border: 0;
      background: var(--nc-accent);
      border-radius: 1px;
    }
    .nc-range {
      background-image: linear-gradient(var(--nc-accent), var(--nc-accent));
      background-repeat: no-repeat;
      background-size: var(--nc-fill, 0%) 100%;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SliderComponent {
  readonly value = model(0);
  readonly min = input(0);
  readonly max = input(100);
  readonly step = input(1);
  readonly label = input<string>();
  readonly readout = input<string>();
  readonly accent = input<'gold' | 'hot' | 'jade' | 'sky' | 'blush' | 'orange'>('gold');
  readonly disabled = input(false);
  readonly compact = input(false, { transform: booleanAttribute });

  protected readonly fill = computed(() => {
    const span = this.max() - this.min();
    const pct = span === 0 ? 0 : ((this.value() - this.min()) / span) * 100;
    return `${String(Math.max(0, Math.min(100, pct)))}%`;
  });

  protected onInput(e: Event): void {
    this.value.set(Number((e.target as HTMLInputElement).value));
  }
}
