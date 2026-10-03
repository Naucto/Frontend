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
 * A whole number you can type or step, with its name beside it. It may hold nothing: some of the
 * things a number names are optional, and an empty box is that, not a zero.
 */
@Component({
  selector: 'nc-number-field',
  imports: [IconComponent],
  templateUrl: './number-field.component.html',
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
  /** Whether the box takes the height it is given, and grows into the width of its cell. */
  readonly fill = input(false, { transform: booleanAttribute });
  /**
   * How much room it takes.
   *
   * `sm` exists for a strip already carrying something else — a row of tabs, a toolbar — where the
   * standing size would set the height of the whole row for the sake of one field.
   */
  readonly size = input<'md' | 'sm'>('md');

  /**
   * The number asked for. The field never writes `value` itself — its owner may refuse or confirm
   * first — and the box goes back to showing whatever value comes back.
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
  /** Wide enough for the largest number it may hold; a box that fills its cell grows from there. */
  protected readonly width = computed(() => Math.max(String(this.max()).length, this.pad()));
  protected readonly canRaise = computed(() => {
    const value = this.value();
    return value === null || value < this.max();
  });
  protected readonly canLower = computed(() => {
    const value = this.value();
    if (value === null) {
      return false;
    }
    return value > this.min() || this.clearable();
  });

  protected nudge(direction: number, event?: Event): void {
    event?.preventDefault();
    const value = this.value();
    // From nothing, up lands on the floor and down stays nothing: an empty box has no number to
    // step away from, and the floor is the first one there is.
    if (value === null) {
      if (direction > 0) {
        this.requested.emit(this.clamp()(this.min()));
      }
      return;
    }
    if (direction < 0 && value <= this.min()) {
      if (this.clearable()) {
        this.cleared.emit();
      }
      return;
    }
    this.ask(value + direction * this.step());
  }

  protected commit(event: Event): void {
    const input = event.target as HTMLInputElement;
    const typed = input.value.trim();
    if (typed === '') {
      if (this.clearable() && this.value() !== null) {
        this.cleared.emit();
      }
    } else if (/^-?(\d+\.?\d*|\.\d+)$/.test(typed)) {
      this.ask(Number(typed));
    }
    // Whatever was typed, the box goes back to showing the value that won.
    input.value = this.shown();
  }

  private print(value: number | null): string {
    if (value === null) {
      return '';
    }
    return this.pad() > 0 ? String(value).padStart(this.pad(), '0') : String(value);
  }

  private readonly clamp = computed(() => (value: number) => {
    const stepped = Math.round((value - this.min()) / this.step()) * this.step() + this.min();
    return Math.max(this.min(), Math.min(this.max(), stepped));
  });

  private ask(next: number): void {
    const wanted = this.clamp()(next);
    if (wanted === this.value()) {
      return;
    }
    this.requested.emit(wanted);
  }
}
