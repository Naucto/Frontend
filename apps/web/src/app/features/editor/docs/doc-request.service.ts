import { Injectable, signal } from '@angular/core';

/**
 * "Show me the docs for this" — raised by F1 and by hovering a symbol in the code editor, acted
 * on by whichever `nc-doc-pane` is mounted (the console tab, or the split column).
 *
 * A counter rides along with each request so asking for the *same* symbol twice still moves the
 * pane: the second F1 on `gfx.spr` has to work as well as the first.
 */
@Injectable({ providedIn: 'root' })
export class DocRequestService {
  private readonly request = signal<{ name: string | null; nonce: number }>({
    name: null,
    nonce: 0,
  });
  private readonly focus = signal(0);

  readonly requested = this.request.asReadonly();
  /** Bumped when something asks the pane to focus its search box (Ctrl-K). */
  readonly searchFocus = this.focus.asReadonly();

  show(name: string): void {
    this.request.update((r) => ({ name, nonce: r.nonce + 1 }));
  }

  focusSearch(): void {
    this.focus.update((n) => n + 1);
  }
}
