import { DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';

import { ButtonDirective } from './button.directive';
import { IconComponent } from './icon.component';

/** Standard dialog chrome: title row with close, body slot, footer slot (`[footer]`). */
@Component({
  selector: 'nc-dialog-shell',
  imports: [ButtonDirective, IconComponent],
  template: `
    <header class="flex h-5 items-center justify-between border-b border-line px-2">
      <h2 class="label text-ink">{{ title() }}</h2>
      <button ncButton variant="ghost" size="sm" iconOnly aria-label="Close" (click)="close()">
        <nc-icon name="close" [size]="12" />
      </button>
    </header>
    <div class="p-2"><ng-content /></div>
    <footer
      class="flex items-center justify-end gap-1 border-t border-line px-2 py-1.5 empty:hidden"
    >
      <ng-content select="[footer]" />
    </footer>
  `,
  host: { class: 'block rounded-md border border-line-strong bg-panel text-ink' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DialogShellComponent {
  readonly title = input.required<string>();
  private readonly ref = inject(DialogRef, { optional: true });
  protected close(): void {
    this.ref?.close();
  }
}
