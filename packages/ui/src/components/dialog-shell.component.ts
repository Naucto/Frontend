import { DialogRef } from '@angular/cdk/dialog';
import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';

import { ButtonDirective } from './button.directive';
import { IconComponent } from './icon.component';

/**
 * Standard dialog chrome: a raised frame holding a head row with the kicker and the close, then the
 * title, an optional lead, the body slot and the footer slot (`[footer]`). What goes in the footer
 * is set against the right edge in the order it is written, so the confirming button is written
 * last and whatever backs out sits to its left.
 *
 * The lead is the one sentence or two that says what the dialog is for, set once here so every
 * dialog opens the same way: a reader meets the same size, the same measure and the same distance
 * from the title before any of them starts its own content.
 */
@Component({
  selector: 'nc-dialog-shell',
  imports: [ButtonDirective, IconComponent],
  templateUrl: './dialog-shell.component.html',
  host: {
    class: 'raised-lg bevel-fill-panel animate-rise text-ink',
    '[class]': "scrollable() ? 'flex max-h-[calc(100dvh-32px)] flex-col' : 'block'",
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DialogShellComponent {
  readonly title = input.required<string>();
  readonly lead = input<string>();
  /** The few words over the title that say what kind of thing is being asked: the action's name. */
  readonly kicker = input<string>();
  /** `danger` for a dialog whose answer cannot be taken back. */
  readonly tone = input<'default' | 'danger'>('default');
  readonly closeLabel = input('Close');
  /** False for a dialog that must be answered through its own buttons, which then has no cross. */
  readonly dismissible = input(true);
  /**
   * The dialog stands no taller than the window, its head, title and footer held, and its body
   * scrolls. Left off where something in the body floats out of it (a list of suggestions under a
   * field), which a scrolling body would cut.
   */
  readonly scrollable = input(false, { transform: booleanAttribute });
  private readonly ref = inject(DialogRef, { optional: true });
  protected readonly kickerInk = computed(() =>
    this.tone() === 'danger' ? 'text-hot-ink' : 'text-ink-3',
  );
  protected close(): void {
    this.ref?.close();
  }
}
