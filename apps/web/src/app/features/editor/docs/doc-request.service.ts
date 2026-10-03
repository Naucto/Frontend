import { Injectable, signal } from '@angular/core';

/**
 * \n * A request to show the docs for a symbol, held until a doc pane is there to act on it.\n *\n
 * * A counter rides along with each request, so asking for the same symbol twice still moves the
 * pane.\n
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
