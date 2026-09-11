import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';

import { IconComponent } from './icon.component';

/** What the frame says about the value, where the value alone cannot say it. */
export type NumberFieldTone = 'default' | 'warn' | 'accent';

const TONE: Record<NumberFieldTone, string> = {
  default: 'border-line bg-inset',
  warn: 'border-orange bg-inset text-orange-ink',
  accent: 'border-hot bg-hot text-on-accent',
};

/**
 * A whole number you can type or step, with its name beside it.
 *
 * The design says what this is not, twice and in its own words: "type a value or step with the
 * arrows. Not a dropdown." A popover of blessed values reads as a menu of the only tempos anyone is
 * allowed, which is the opposite of what a tempo is.
 *
 * The carets stack on the right rather than sitting either side of the value, so the pair reads as
 * one control and the value keeps the left edge it shares with every other label in the bar.
 *
 * It may hold nothing. Some of the things a number names are optional — a place in a chain that
 * has not been filled — and an empty box is that, not a zero.
 */
@Component({
  selector: 'nc-number-field',
  imports: [IconComponent],
  template: `
    <div
      class="flex items-stretch overflow-hidden rounded-sm border"
      [class]="frameClass()"
      [class.h-full]="fill()"
    >
      <div class="flex min-w-0 flex-1 items-center gap-1" [class]="padClass()">
        @if (label()) {
          <span class="label">{{ label() }}</span>
        }
        <!-- A field, not a readout: the arrows are the coarse way in and typing is the exact one.
             Committed on blur and on Enter rather than per keystroke, so a half-typed 4 on the way
             to 140 is not a tempo anybody hears. -->
        <input
          type="text"
          inputmode="numeric"
          [attr.aria-label]="label() || ariaLabel()"
          [value]="shown()"
          [attr.placeholder]="placeholder()"
          [style.width.ch]="width()"
          [class]="
            'min-w-0 flex-1 bg-transparent text-right font-mono outline-none placeholder:text-ink-4 ' +
            textClass()
          "
          (keydown.enter)="commit($event)"
          (keydown.arrowUp)="nudge(1, $event)"
          (keydown.arrowDown)="nudge(-1, $event)"
          (blur)="commit($event)"
        />
      </div>
      <div class="flex flex-none flex-col border-l border-line" [class]="caretsClass()">
        <button
          type="button"
          class="flex flex-1 items-center justify-center text-ink-3 hover:text-ink disabled:opacity-40 disabled:hover:text-ink-3"
          [attr.aria-label]="(label() || ariaLabel()) + ' +' + step()"
          [disabled]="!canRaise()"
          (click)="nudge(1)"
        >
          <nc-icon name="caret-up" [size]="12" />
        </button>
        <button
          type="button"
          class="flex flex-1 items-center justify-center border-t border-line text-ink-3 hover:text-ink disabled:opacity-40 disabled:hover:text-ink-3"
          [attr.aria-label]="(label() || ariaLabel()) + ' -' + step()"
          [disabled]="!canLower()"
          (click)="nudge(-1)"
        >
          <nc-icon name="caret-down" [size]="12" />
        </button>
      </div>
    </div>
  `,
  host: { class: 'inline-block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NumberFieldComponent {
  readonly value = input.required<number | null>();
  readonly label = input('');
  /** The name to announce where the box carries no printed label. */
  readonly ariaLabel = input('');
  readonly min = input(0);
  readonly max = input(100);
  readonly step = input(1);
  /** Digits the number is written to, zero-padded. `0` prints it as it is. */
  readonly pad = input(0);
  /** What an empty box shows in place of a number. */
  readonly placeholder = input('');
  readonly tone = input<NumberFieldTone>('default');
  /**
   * Whether the box may be emptied.
   *
   * Off, the value is a setting and always has one. On, stepping below the floor and clearing the
   * text both mean "nothing here", and that is what {@link cleared} reports.
   */
  readonly clearable = input(false, { transform: booleanAttribute });
  /** Whether the box takes the width and height it is given rather than the width of its digits. */
  readonly fill = input(false, { transform: booleanAttribute });
  /**
   * How much room it takes.
   *
   * `sm` exists for a strip already carrying something else — a row of tabs, a toolbar — where the
   * standing size would set the height of the whole row for the sake of one field.
   */
  readonly size = input<'md' | 'sm'>('md');

  /**
   * The field proposes; the owner disposes.
   *
   * It never writes `value` itself, because none of its owners can take a number on trust:
   * shortening a pattern drops the notes past its new end, and something has to be able to ask
   * first. The box goes back to showing whatever value came back.
   */
  readonly requested = output<number>();
  /** The box was emptied. Only ever fires where {@link clearable} is on. */
  readonly cleared = output();

  protected readonly padClass = computed(() =>
    this.size() === 'sm' ? 'px-0.75 py-[1px]' : 'px-1.25 py-[5px]',
  );
  protected readonly textClass = computed(() =>
    this.size() === 'sm' ? 'text-micro' : 'text-body',
  );
  protected readonly caretsClass = computed(() => (this.size() === 'sm' ? 'w-[14px]' : 'w-[18px]'));
  protected readonly frameClass = computed(() => TONE[this.tone()]);
  protected readonly shown = computed(() => this.print(this.value()));
  /** Wide enough for the largest number it may hold, or left to the box where one is given. */
  protected readonly width = computed(() =>
    this.fill() ? null : Math.max(String(this.max()).length, this.pad()),
  );
  protected readonly canRaise = computed(() => {
    const v = this.value();
    return v === null || v < this.max();
  });
  protected readonly canLower = computed(() => {
    const v = this.value();
    if (v === null) return false;
    return v > this.min() || this.clearable();
  });

  protected nudge(direction: number, event?: Event): void {
    event?.preventDefault();
    const v = this.value();
    // From nothing, up lands on the floor and down stays nothing: an empty box has no number to
    // step away from, and the floor is the first one there is.
    if (v === null) {
      if (direction > 0) this.requested.emit(this.clamp()(this.min()));
      return;
    }
    if (direction < 0 && v <= this.min()) {
      if (this.clearable()) this.cleared.emit();
      return;
    }
    this.ask(v + direction * this.step());
  }

  protected commit(event: Event): void {
    const input = event.target as HTMLInputElement;
    const digits = input.value.replace(/[^\d-]/g, '');
    if (digits === '' || !Number.isFinite(Number(digits))) {
      if (this.clearable() && this.value() !== null) this.cleared.emit();
    } else {
      this.ask(Number(digits));
    }
    // Whatever was typed, the box goes back to showing the value that won.
    input.value = this.shown();
  }

  private print(n: number | null): string {
    if (n === null) return '';
    return this.pad() > 0 ? String(n).padStart(this.pad(), '0') : String(n);
  }

  private readonly clamp = computed(() => (n: number) => {
    const stepped = Math.round((n - this.min()) / this.step()) * this.step() + this.min();
    return Math.max(this.min(), Math.min(this.max(), stepped));
  });

  private ask(next: number): void {
    const wanted = this.clamp()(next);
    if (wanted === this.value()) return;
    this.requested.emit(wanted);
  }
}
