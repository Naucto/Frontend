/**
 * A valid id for a fixture that stays readable: `uuidOf(7)` is
 * `00000000-0000-4000-8000-000000000007`, the shape the backend's own fixtures use.
 */
export function uuidOf(small: number): string {
  return `00000000-0000-4000-8000-${String(small).padStart(12, '0')}`;
}
