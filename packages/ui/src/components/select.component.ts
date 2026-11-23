import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  DOCUMENT,
  effect,
  type ElementRef,
  inject,
  input,
  model,
  signal,
  untracked,
  viewChild,
} from '@angular/core';

import { closedBy } from './disabled-scope.directive';
import { WELL, WELL_DISABLED } from './input.directive';
import { MarkComponent } from './mark.component';
import { OptionDirective } from './option.directive';
import { PopoverDirective } from './popover.directive';
import { PopoverPanelComponent } from './popover-panel.component';

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

/** How long a pause ends a typed prefix, as a native select counts it. */
const TYPE_AHEAD_MS = 500;

const TRIGGER =
  `${WELL} ${WELL_DISABLED} flex h-(--nc-h-lg) w-full cursor-pointer items-center gap-1 px-1.5 ` +
  'text-left font-ui text-body text-ink outline-none';

let nextId = 0;

/**
 * One value out of a list, in a well the height of a text field. The list opens in a popover under
 * it; the focus stays on the field, which points at the option the keyboard is on.
 *
 * Keys follow a native select: the arrows, Home and End move, Enter or Space takes the option,
 * Escape and Tab close without taking it, and typing the start of a label goes to it, open or not.
 */
@Component({
  selector: 'nc-select',
  imports: [MarkComponent, OptionDirective, PopoverDirective, PopoverPanelComponent],
  templateUrl: './select.component.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SelectComponent<T extends string = string> {
  readonly options = input.required<readonly SelectOption<T>[]>();
  readonly value = model<T>();
  readonly placeholder = input('');
  readonly disabled = input(false, { transform: booleanAttribute });
  /** The field's id, for an `nc-field` (or any `<label for>`) to name it. */
  readonly inputId = input<string>();
  /** The name, where no label points at the field. */
  readonly label = input<string>();

  protected readonly closed = closedBy(() => this.disabled());
  protected readonly TRIGGER = TRIGGER;
  protected readonly listId = `nc-select-${String(nextId++)}`;
  protected readonly open = signal(false);
  /** The option the keyboard or the pointer is on while the list is open. */
  protected readonly active = signal(-1);
  /** The list is at least as wide as the field it drops from. */
  protected readonly width = signal(0);
  protected readonly current = computed(() =>
    this.options().find((option) => option.value === this.value()),
  );

  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private readonly document = inject(DOCUMENT);
  private typed = '';
  private typedTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    // Whoever opened it (a click, a key, the popover's own backdrop or Escape closing it), the list
    // starts on the chosen option and as wide as the field.
    effect(() => {
      if (!this.open()) {
        this.active.set(-1);
        return;
      }
      untracked(() => {
        this.width.set(this.trigger().nativeElement.offsetWidth);
        const start = this.active() < 0 ? Math.max(0, this.indexOfValue()) : this.active();
        this.active.set(start);
        // Scrolled once the overlay has laid the list out, which it does after this change.
        queueMicrotask(() => {
          this.moveTo(this.active());
        });
      });
    });
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.typedTimer);
    });
  }

  protected optionId(index: number): string {
    return `${this.listId}-${String(index)}`;
  }

  private indexOfValue(): number {
    return this.options().findIndex((option) => option.value === this.value());
  }

  private moveTo(index: number): void {
    this.active.set(index);
    this.document.getElementById(this.optionId(index))?.scrollIntoView({ block: 'nearest' });
  }

  protected choose(index: number): void {
    const option = this.options()[index];
    if (option) {
      this.value.set(option.value);
    }
    this.open.set(false);
  }

  /** The next option whose label starts with what was typed, from the one after `from`. */
  private match(from: number): number {
    const options = this.options();
    const prefix = this.typed.toLowerCase();
    for (let step = 1; step <= options.length; step++) {
      const index = (from + step) % options.length;
      if (options[index]?.label.toLowerCase().startsWith(prefix)) {
        return index;
      }
    }
    return -1;
  }

  private typeAhead(key: string): void {
    clearTimeout(this.typedTimer);
    this.typedTimer = setTimeout(() => {
      this.typed = '';
    }, TYPE_AHEAD_MS);
    // Pressing the same letter again steps through the options it starts; a longer prefix stays on
    // the option it already reached, as long as that one still matches.
    const repeat = this.typed.length > 0 && this.typed === key.repeat(this.typed.length);
    this.typed = repeat ? key : this.typed + key;
    const at = this.open() ? this.active() : this.indexOfValue();
    const found = this.match(this.typed.length > 1 ? at - 1 : at);
    if (found < 0) {
      return;
    }
    if (this.open()) {
      this.moveTo(found);
    } else {
      this.choose(found);
    }
  }

  protected onKey(event: KeyboardEvent): void {
    const last = this.options().length - 1;
    const printable = event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;
    if (printable && !(event.key === ' ' && this.typed === '')) {
      event.preventDefault();
      this.typeAhead(event.key);
      return;
    }
    if (!this.open()) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        this.active.set(Math.max(0, this.indexOfValue()));
        this.open.set(true);
      }
      return;
    }
    switch (event.key) {
      case 'ArrowDown':
        this.moveTo(Math.min(last, this.active() + 1));
        break;
      case 'ArrowUp':
        this.moveTo(Math.max(0, this.active() - 1));
        break;
      case 'Home':
        this.moveTo(0);
        break;
      case 'End':
        this.moveTo(last);
        break;
      case 'Enter':
      case ' ':
        this.choose(this.active());
        break;
      case 'Escape':
        // Kept from a dialog under the list, which would close on the same key.
        event.stopPropagation();
        this.open.set(false);
        break;
      case 'Tab':
        this.open.set(false);
        return;
      default:
        return;
    }
    event.preventDefault();
  }
}
