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
  template: `
    <header class="flex h-(--nc-bar-h) items-center justify-between border-b border-line px-2.5">
      <h2 class="font-mono text-body tracking-tag text-ink uppercase">{{ title() }}</h2>
      <button
        ncButton
        variant="ghost"
        size="sm"
        iconOnly
        [attr.aria-label]="closeLabel()"
        (click)="close()"
      >
        <nc-icon name="close" [size]="12" />
      </button>
    </header>
    <div class="px-2.5 py-2">
      @if (lead(); as lead) {
        <p class="mb-2 max-w-[56ch] text-body leading-[1.65] text-ink-2">{{ lead }}</p>
      }
      <ng-content />
    </div>
    <footer
      class="flex items-center justify-end gap-1 border-t border-line px-2.5 py-1.5 empty:hidden"
    >
      <ng-content select="[footer]" />
    </footer>
  `,
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
