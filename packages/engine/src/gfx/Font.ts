/**
 * Built-in 4×6 pixel font (3×5 glyphs + 1px spacing). Each glyph is 5 rows of 3
 * bits, MSB = leftmost pixel. Lowercase maps to uppercase.
 */
export const FONT_WIDTH = 4;
export const FONT_HEIGHT = 6;
export const FONT_FIRST = 32;
export const FONT_LAST = 126;

// prettier-ignore
const GLYPHS: Record<string, [number, number, number, number, number]> = {
  ' ': [0b000, 0b000, 0b000, 0b000, 0b000],
  '!': [0b010, 0b010, 0b010, 0b000, 0b010],
  '"': [0b101, 0b101, 0b000, 0b000, 0b000],
  '#': [0b101, 0b111, 0b101, 0b111, 0b101],
  '$': [0b111, 0b110, 0b111, 0b011, 0b111],
  '%': [0b101, 0b001, 0b010, 0b100, 0b101],
  '&': [0b010, 0b101, 0b010, 0b101, 0b011],
  "'": [0b010, 0b010, 0b000, 0b000, 0b000],
  '(': [0b001, 0b010, 0b010, 0b010, 0b001],
  ')': [0b100, 0b010, 0b010, 0b010, 0b100],
  '*': [0b101, 0b010, 0b111, 0b010, 0b101],
  '+': [0b000, 0b010, 0b111, 0b010, 0b000],
  ',': [0b000, 0b000, 0b000, 0b010, 0b100],
  '-': [0b000, 0b000, 0b111, 0b000, 0b000],
  '.': [0b000, 0b000, 0b000, 0b000, 0b010],
  '/': [0b001, 0b001, 0b010, 0b100, 0b100],
  '0': [0b111, 0b101, 0b101, 0b101, 0b111],
  '1': [0b010, 0b110, 0b010, 0b010, 0b111],
  '2': [0b111, 0b001, 0b111, 0b100, 0b111],
  '3': [0b111, 0b001, 0b011, 0b001, 0b111],
  '4': [0b101, 0b101, 0b111, 0b001, 0b001],
  '5': [0b111, 0b100, 0b111, 0b001, 0b111],
  '6': [0b111, 0b100, 0b111, 0b101, 0b111],
  '7': [0b111, 0b001, 0b001, 0b010, 0b010],
  '8': [0b111, 0b101, 0b111, 0b101, 0b111],
  '9': [0b111, 0b101, 0b111, 0b001, 0b111],
  ':': [0b000, 0b010, 0b000, 0b010, 0b000],
  ';': [0b000, 0b010, 0b000, 0b010, 0b100],
  '<': [0b001, 0b010, 0b100, 0b010, 0b001],
  '=': [0b000, 0b111, 0b000, 0b111, 0b000],
  '>': [0b100, 0b010, 0b001, 0b010, 0b100],
  '?': [0b111, 0b001, 0b011, 0b000, 0b010],
  '@': [0b111, 0b101, 0b111, 0b100, 0b111],
  'A': [0b010, 0b101, 0b111, 0b101, 0b101],
  'B': [0b110, 0b101, 0b110, 0b101, 0b110],
  'C': [0b011, 0b100, 0b100, 0b100, 0b011],
  'D': [0b110, 0b101, 0b101, 0b101, 0b110],
  'E': [0b111, 0b100, 0b110, 0b100, 0b111],
  'F': [0b111, 0b100, 0b110, 0b100, 0b100],
  'G': [0b011, 0b100, 0b101, 0b101, 0b011],
  'H': [0b101, 0b101, 0b111, 0b101, 0b101],
  'I': [0b111, 0b010, 0b010, 0b010, 0b111],
  'J': [0b001, 0b001, 0b001, 0b101, 0b010],
  'K': [0b101, 0b101, 0b110, 0b101, 0b101],
  'L': [0b100, 0b100, 0b100, 0b100, 0b111],
  'M': [0b101, 0b111, 0b111, 0b101, 0b101],
  'N': [0b110, 0b101, 0b101, 0b101, 0b101],
  'O': [0b010, 0b101, 0b101, 0b101, 0b010],
  'P': [0b110, 0b101, 0b110, 0b100, 0b100],
  'Q': [0b010, 0b101, 0b101, 0b111, 0b011],
  'R': [0b110, 0b101, 0b110, 0b101, 0b101],
  'S': [0b011, 0b100, 0b010, 0b001, 0b110],
  'T': [0b111, 0b010, 0b010, 0b010, 0b010],
  'U': [0b101, 0b101, 0b101, 0b101, 0b111],
  'V': [0b101, 0b101, 0b101, 0b101, 0b010],
  'W': [0b101, 0b101, 0b111, 0b111, 0b101],
  'X': [0b101, 0b101, 0b010, 0b101, 0b101],
  'Y': [0b101, 0b101, 0b010, 0b010, 0b010],
  'Z': [0b111, 0b001, 0b010, 0b100, 0b111],
  '[': [0b011, 0b010, 0b010, 0b010, 0b011],
  '\\': [0b100, 0b100, 0b010, 0b001, 0b001],
  ']': [0b110, 0b010, 0b010, 0b010, 0b110],
  '^': [0b010, 0b101, 0b000, 0b000, 0b000],
  '_': [0b000, 0b000, 0b000, 0b000, 0b111],
  '`': [0b100, 0b010, 0b000, 0b000, 0b000],
  '{': [0b011, 0b010, 0b100, 0b010, 0b011],
  '|': [0b010, 0b010, 0b010, 0b010, 0b010],
  '}': [0b110, 0b010, 0b001, 0b010, 0b110],
  '~': [0b000, 0b001, 0b111, 0b100, 0b000],
};

const GLYPH_COUNT = FONT_LAST - FONT_FIRST + 1;

/** Glyph atlas: one row of 95 cells, 4×6 each; value 1 = ink. */
export function buildFontAtlas(): { data: Uint8Array; width: number; height: number } {
  const width = GLYPH_COUNT * FONT_WIDTH;
  const height = FONT_HEIGHT;
  const data = new Uint8Array(width * height);
  for (let code = FONT_FIRST; code <= FONT_LAST; code++) {
    const ch = String.fromCharCode(code);
    const rows = GLYPHS[ch] ?? GLYPHS[ch.toUpperCase()];
    if (!rows) continue;
    const cx = (code - FONT_FIRST) * FONT_WIDTH;
    rows.forEach((bits, y) => {
      for (let x = 0; x < 3; x++) if ((bits >> (2 - x)) & 1) data[y * width + cx + x] = 1;
    });
  }
  return { data, width, height };
}

export function glyphIndex(ch: string): number {
  let code = ch.charCodeAt(0);
  if (code >= 97 && code <= 122) code -= 32;
  if (code < FONT_FIRST || code > FONT_LAST) return 0;
  return code - FONT_FIRST;
}
