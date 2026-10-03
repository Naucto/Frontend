import type * as Y from 'yjs';

export interface Splice {
  start: number;
  end: number;
  text: string;
}

/** Applies splices to a Y.Text from the end so earlier offsets stay valid. */
export function applySplices(text: Y.Text, splices: Splice[]): number {
  for (let i = splices.length - 1; i >= 0; i--) {
    const splice = splices[i];
    if (!splice) {
      continue;
    }
    text.delete(splice.start, splice.end - splice.start);
    text.insert(splice.start, splice.text);
  }
  return splices.length;
}
