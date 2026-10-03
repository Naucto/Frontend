import { DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';

import { ButtonDirective } from './button.directive';
import { IconComponent } from './icon.component';

/**
 * Standard dialog chrome: title row with close, an optional lead, body slot, footer slot
 * (`[footer]`).
 *
 * The lead is the one sentence or two that says what the dialog is for, set once here so every
 * dialog opens the same way: a reader meets the same size, the same measure and the same distance
 * from the title before any of them starts its own content.
 */
@Component({
  selector: 'nc-dialog-shell',
  imports: [ButtonDirective, IconComponent],
  templateUrl: './dialog-shell.component.html',
  host: { class: 'block rounded-md border border-line-strong bg-panel text-ink' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DialogShellComponent {
  readonly title = input.required<string>();
  readonly lead = input<string>();
  readonly closeLabel = input('Close');
  private readonly ref = inject(DialogRef, { optional: true });
  protected close(): void {
    this.ref?.close();
  }
}
