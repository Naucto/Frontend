/**
 * Where an arrow key takes the highlight of a list, wrapping at both ends, or `null` for any other
 * key. An empty list keeps the cursor it has, so the key is still answered for and the caret of
 * the field the list hangs from does not jump to an end.
 */
export function arrowStep(key: string, cursor: number, count: number): number | null {
  if (key !== 'ArrowDown' && key !== 'ArrowUp') {
    return null;
  }
  if (count === 0) {
    return cursor;
  }
  return (cursor + (key === 'ArrowDown' ? 1 : -1) + count) % count;
}
