/** An id as the API writes one, a UUID in lower case, as the source of a pattern to build on. */
export const ID_PATTERN = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

const ID = new RegExp(`^${ID_PATTERN}$`);

/**
 * Whether a text is an id. An id is opaque: it is compared for equality and never read, added to
 * or taken for older or newer than another.
 */
export const isId = (text: string): boolean => ID.test(text);

/**
 * Orders two ids as the server does, byte by byte, which lower-case hex text reproduces. The
 * order means nothing; it only makes every client and the server sort the same ids alike.
 */
export function compareIds(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}
