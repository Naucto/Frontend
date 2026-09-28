/**
 * Whether the document still holds everything a finished save uploaded.
 *
 * A save encodes the document, sends it, and waits for the reply. The document keeps moving during
 * that round trip, and what arrives in the gap — a keystroke, a peer's edit, a change accepted from
 * the assistant — is not in the bytes that went out.
 *
 * So a save may only conclude "nothing left to save" if nothing changed while it was in flight. This
 * is the whole of that judgement, kept separate from the session so it can be tested directly:
 * getting it backwards is silent, and it costs a change that then exists only in one tab.
 */
export class SaveTracker {
  private revision = 0;

  /** Called for every change to the document, local or applied. */
  changed(): void {
    this.revision += 1;
  }

  /** Taken just before encoding, and handed back to `settled` when the save returns. */
  mark(): number {
    return this.revision;
  }

  /** Whether the document still holds what `mark` covered, and so needs no further save. */
  settled(mark: number): boolean {
    return mark === this.revision;
  }
}
