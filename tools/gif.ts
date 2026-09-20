/**
 * The smallest GIF encoder that does the job: one global palette of up to 256 colours, one LZW
 * stream per frame, looping forever.
 *
 * A console frame is drawn from a palette of sixteen, with a screen palette of at most sixteen
 * rows over it, so the whole of an animation fits in a GIF's table without dithering. The
 * encoder is written by hand for the same reason the PNG one is: the frames it serves are a few
 * hundred kilobytes of documentation, not a use for an image library.
 */

const LOOP_FOREVER = new Uint8Array([
  0x21, 0xff, 0x0b, 0x4e, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45, 0x32, 0x2e, 0x30, 0x03, 0x01,
  0x00, 0x00, 0x00,
]);

/** The LZW stream of one frame, packed into GIF sub-blocks, with an 8-bit minimum code size. */
function lzw(indices: Uint8Array): Uint8Array {
  const MIN = 8;
  const CLEAR = 1 << MIN;
  const END = CLEAR + 1;
  const out: number[] = [];
  let acc = 0;
  let bits = 0;
  const emit = (code: number, size: number): void => {
    acc |= code << bits;
    bits += size;
    while (bits >= 8) {
      out.push(acc & 0xff);
      acc >>>= 8;
      bits -= 8;
    }
  };

  let size = MIN + 1;
  let next = END + 1;
  let table = new Map<number, number>();
  emit(CLEAR, size);
  let prefix = indices[0] ?? 0;
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i] ?? 0;
    const key = (prefix << 8) | k;
    const found = table.get(key);
    if (found !== undefined) {
      prefix = found;
      continue;
    }
    emit(prefix, size);
    if (next < 4096) {
      table.set(key, next++);
      if (next > 1 << size && size < 12) size++;
    } else {
      emit(CLEAR, size);
      table = new Map();
      next = END + 1;
      size = MIN + 1;
    }
    prefix = k;
  }
  emit(prefix, size);
  emit(END, size);
  if (bits > 0) out.push(acc & 0xff);

  const blocks: number[] = [MIN];
  for (let i = 0; i < out.length; i += 255) {
    const slice = out.slice(i, i + 255);
    blocks.push(slice.length, ...slice);
  }
  blocks.push(0);
  return new Uint8Array(blocks);
}

/**
 * `frames` are width × height × 3 bytes each, row-major; `delayMs` is the time each one shows.
 * Colours past the 256th are drawn as the nearest of the first 256, which a console frame never
 * needs.
 */
export function encodeGif(
  width: number,
  height: number,
  frames: readonly Uint8Array[],
  delayMs: number,
): Uint8Array {
  const palette: number[] = [];
  const slot = new Map<number, number>();
  const indexOf = (rgb: number): number => {
    const known = slot.get(rgb);
    if (known !== undefined) return known;
    if (palette.length < 256) {
      palette.push(rgb);
      slot.set(rgb, palette.length - 1);
      return palette.length - 1;
    }
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < palette.length; i++) {
      const p = palette[i] ?? 0;
      const dr = (p >> 16) - (rgb >> 16);
      const dg = ((p >> 8) & 0xff) - ((rgb >> 8) & 0xff);
      const db = (p & 0xff) - (rgb & 0xff);
      const dist = dr * dr + dg * dg + db * db;
      if (dist < bestDist) [best, bestDist] = [i, dist];
    }
    slot.set(rgb, best);
    return best;
  };
  const indexed = frames.map((rgb) => {
    const out = new Uint8Array(width * height);
    for (let i = 0; i < out.length; i++) {
      const r = rgb[i * 3] ?? 0;
      const g = rgb[i * 3 + 1] ?? 0;
      const b = rgb[i * 3 + 2] ?? 0;
      out[i] = indexOf((r << 16) | (g << 8) | b);
    }
    return out;
  });

  const parts: Uint8Array[] = [];
  parts.push(new Uint8Array(Array.from('GIF89a', (ch) => ch.charCodeAt(0))));
  // Logical screen: size, a global table of 256 entries, background 0, square pixels.
  parts.push(
    new Uint8Array([width & 0xff, width >> 8, height & 0xff, height >> 8, 0xf7, 0x00, 0x00]),
  );
  const table = new Uint8Array(256 * 3);
  palette.forEach((rgb, i) => {
    table[i * 3] = rgb >> 16;
    table[i * 3 + 1] = (rgb >> 8) & 0xff;
    table[i * 3 + 2] = rgb & 0xff;
  });
  parts.push(table);
  parts.push(LOOP_FOREVER);
  const delay = Math.max(1, Math.round(delayMs / 10));
  for (const frame of indexed) {
    parts.push(new Uint8Array([0x21, 0xf9, 0x04, 0x00, delay & 0xff, delay >> 8, 0x00, 0x00]));
    parts.push(
      new Uint8Array([
        0x2c,
        0,
        0,
        0,
        0,
        width & 0xff,
        width >> 8,
        height & 0xff,
        height >> 8,
        0x00,
      ]),
    );
    parts.push(lzw(frame));
  }
  parts.push(new Uint8Array([0x3b]));

  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
