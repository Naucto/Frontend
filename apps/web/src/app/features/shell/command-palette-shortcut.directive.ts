import { Dialog, type DialogRef } from '@angular/cdk/dialog';
import { Directive, inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { DialogService } from '@naucto/ui';

import { CommandPaletteComponent } from './command-palette.component';

/**
 * Ctrl/⌘-K opens the command palette, and closes it again.
 *
 * Heard on the window, which the key reaches after every listener on the document has had it: a
 * screen that keeps the key for itself, as the docs search does, says so by preventing its
 * default, and the palette stands down without having to know which screens those are.
 */
@Directive({
  selector: '[ncCommandPaletteShortcut]',
  host: { '(window:keydown)': 'onKey($event)' },
})
export class CommandPaletteShortcutDirective {
  private readonly dialogs = inject(DialogService);
  private readonly stack = inject(Dialog);
  private readonly i18n = inject(TranslocoService);
  private palette: DialogRef<unknown, CommandPaletteComponent> | null = null;

  protected onKey(event: KeyboardEvent): void {
    if (
      event.key.toLowerCase() !== 'k' ||
      !(event.ctrlKey || event.metaKey) ||
      event.altKey ||
      event.shiftKey ||
      event.defaultPrevented
    ) {
      return;
    }
    // Ours from here on, so the browser's own Ctrl-K (the address bar's search) stays put.
    event.preventDefault();
    if (this.palette) {
      this.palette.close();
      return;
    }
    // A dialog already up is waiting for an answer the palette would walk away from.
    if (this.stack.openDialogs.length > 0) {
      return;
    }
    const palette = this.dialogs.open(CommandPaletteComponent, {
      top: 'min(120px, 12dvh)',
      ariaLabel: this.i18n.translate('palette.label'),
    });
    this.palette = palette;
    palette.closed.subscribe(() => {
      this.palette = null;
    });
  }
}
