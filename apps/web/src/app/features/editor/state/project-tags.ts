/**
 * The document keeps a game's tags as one JSON array in a text, so that two peers retyping the list
 * merge as text does. Anything that is not an array, half-typed JSON included, reads as no tags.
 */
export function parseTags(json: string): string[] {
  try {
    const parsed = JSON.parse(json || '[]') as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}
