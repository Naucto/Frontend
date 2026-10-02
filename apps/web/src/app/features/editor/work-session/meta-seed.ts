import type * as Y from 'yjs';

/**
 * Copies a value from the server into a document's text, once.
 *
 * The obvious guard — write only when the text is empty — is not enough. Every editor that joins a
 * project runs the seed, and two of them opening the same untouched project both see an empty text
 * and both write into it. Yjs keeps both writes, so the value is not doubled in one place and
 * dropped in another: it is concatenated. A name seeded twice came out as
 * "Untitled gameUntitled game", which is a single character over what the API accepts, and since
 * the metadata update is made in front of the document upload, that rejected name then stopped the
 * project being saved at all — a project that could no longer be opened, and no way to open it to
 * fix the name.
 *
 * So: a value that is already there is left alone, and one that arrived doubled is folded back to
 * a single copy. Both are repairs of a state the old code could reach, which is why they are here
 * rather than a retry.
 *
 * A text holding something else entirely is left untouched. That is a person having renamed the
 * project in the editor, and a join must not undo it.
 */
export function seedText(text: Y.Text, value: string): void {
  if (!value) return;
  const current = text.toString();
  if (current === value) return;
  if (
    current.length > 0 &&
    current.length % value.length === 0 &&
    current === value.repeat(current.length / value.length)
  ) {
    text.delete(0, text.length);
    text.insert(0, value);
    return;
  }
  if (text.length === 0) text.insert(0, value);
}
