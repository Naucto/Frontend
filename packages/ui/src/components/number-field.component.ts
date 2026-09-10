import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { IconComponent } from './icon.component';

/**
 * A whole number you can type or step, with its name beside it.
 *
 * The design says what this is not, twice and in its own words: "type a value or step with the
 * arrows. Not a dropdown." A popover of blessed values reads as a menu of the only tempos anyone is
 * allowed, which is the opposite of what a tempo is.
 *
 * The carets stack on the right rather than sitting either side of the value, so the pair reads as
 * one control and the value keeps the left edge it shares with every other label in the bar.
 */
@Component({
  selector: 'nc-number-field',
  imports: [IconComponent],
  template: `
    <div class="flex items-stretch overflow-hidden rounded-sm border border-line bg-inset">
      <div class="flex items-center gap-1" [class]="padClass()">
        <span class="label">{{ label() }}</span>
        <!-- A field, not a readout: the arrows are the coarse way in and typing is the exact one.
             Committed on blur and on Enter rather than per keystroke, so a half-typed 4 on the way
             to 140 is not a tempo anybody hears. -->
        <input
          type="text"
          inputmode="numeric"
          [attr.aria-label]="label()"
          [value]="value()"
          [style.width.ch]="String(max()).length"
          [class]="'bg-transparent text-right font-mono text-ink outline-none ' + textClass()"
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
          [attr.aria-label]="label() + ' +' + step()"
          [disabled]="value() >= max()"
          (click)="nudge(1)"
        >
          <nc-icon name="caret-up" [size]="12" />
        </button>
        <button
          type="button"
          class="flex flex-1 items-center justify-center border-t border-line text-ink-3 hover:text-ink disabled:opacity-40 disabled:hover:text-ink-3"
          [attr.aria-label]="label() + ' -' + step()"
          [disabled]="value() <= min()"
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
  readonly value = input.required<number>();
  readonly label = input('');
  readonly min = input(0);
  readonly max = input(100);
  readonly step = input(1);
  /**
   * How much room it takes.
   *
   * `sm` exists for a strip already carrying something else — a row of tabs, a toolbar — where the
   * standing size would set the height of the whole row for the sake of one field.
   */
  readonly size = input<'md' | 'sm'>('md');

  protected readonly padClass = computed(() =>
    this.size() === 'sm' ? 'px-0.75 py-[1px]' : 'px-1.25 py-[5px]',
  );
  protected readonly textClass = computed(() =>
    this.size() === 'sm' ? 'text-micro' : 'text-body',
  );
  protected readonly caretsClass = computed(() => (this.size() === 'sm' ? 'w-[14px]' : 'w-[18px]'));
  /**
   * The field proposes; the owner disposes.
   *
   * It never writes `value` itself, because none of its owners can take a number on trust:
   * shortening a pattern drops the notes past its new end, and something has to be able to ask
   * first. The box goes back to showing whatever value came back.
   */
  readonly requested = output<number>();

  protected readonly String = String;
  protected readonly clamp = computed(() => (n: number) => {
    const stepped = Math.round((n - this.min()) / this.step()) * this.step() + this.min();
    return Math.max(this.min(), Math.min(this.max(), stepped));
  });

  protected nudge(direction: number, event?: Event): void {
    event?.preventDefault();
    this.ask(this.value() + direction * this.step());
  }

  protected commit(event: Event): void {
    const input = event.target as HTMLInputElement;
    const typed = Number(input.value.replace(/[^\d-]/g, ''));
    if (Number.isFinite(typed) && input.value.trim() !== '') this.ask(typed);
    // Whatever was typed, the box goes back to showing the value that won.
    input.value = String(this.value());
  }

  private ask(next: number): void {
    const wanted = this.clamp()(next);
    if (wanted === this.value()) return;
    this.requested.emit(wanted);
  }
}
