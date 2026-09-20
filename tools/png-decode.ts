import { inflateSync } from 'node:zlib';

/**
 * The counterpart of `png.ts`: 8-bit RGB or RGBA, no interlacing, the five scanline filters.
 *
 * The photo demo reads one PNG that this repository ships, whose shape is known. Anything the
 * decoder does not handle — palettes, 16-bit samples, interlacing — is refused with a message
 * rather than misread, so a replacement picture that needs more is noticed at generation time.
 */

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export interface DecodedPng {
  width: number;
  height: number;
  /** width × height × 3 bytes, row-major. An alpha channel, when the file has one, is dropped. */
  rgb: Uint8Array;
}

// PNG spec 9.4: the predictor that picks whichever neighbour is closest to the gradient estimate.
function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

export function decodePng(bytes: Uint8Array): DecodedPng {
  if (SIGNATURE.some((v, i) => bytes[i] !== v)) throw new Error('not a PNG');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  let width = 0;
  let height = 0;
  let channels = 0;
  const idat: Uint8Array[] = [];
  for (let at = 8; at + 12 <= bytes.length;) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    const body = bytes.subarray(at + 8, at + 8 + length);
    if (type === 'IHDR') {
      width = view.getUint32(at + 8);
      height = view.getUint32(at + 12);
      const [depth, colour, interlace] = [body[8], body[9], body[12]];
      if (depth !== 8 || (colour !== 2 && colour !== 6) || interlace !== 0) {
        throw new Error(
          `unsupported PNG: ${String(depth)}-bit, colour type ${String(colour)}, interlace ${String(interlace)}`,
        );
      }
      channels = colour === 6 ? 4 : 3;
    } else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
    at += 12 + length;
  }
  if (!channels) throw new Error('PNG without IHDR');

  const stride = width * channels;
  const raw = new Uint8Array(inflateSync(Buffer.concat(idat)));
  if (raw.length !== (stride + 1) * height) {
    throw new Error(
      `PNG data is ${String(raw.length)} bytes, expected ${String((stride + 1) * height)}`,
    );
  }

  // Each row is reconstructed against the previous reconstructed row, so `prev` is the output,
  // not the filtered input; the first row sees a row of zeros.
  let prev = new Uint8Array(stride);
  const rgb = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const row = new Uint8Array(stride);
    for (let i = 0; i < stride; i++) {
      const x = line[i] ?? 0;
      const a = i >= channels ? (row[i - channels] ?? 0) : 0;
      const b = prev[i] ?? 0;
      const c = i >= channels ? (prev[i - channels] ?? 0) : 0;
      let v: number;
      switch (filter) {
        case 0:
          v = x;
          break;
        case 1:
          v = x + a;
          break;
        case 2:
          v = x + b;
          break;
        case 3:
          v = x + ((a + b) >> 1);
          break;
        case 4:
          v = x + paeth(a, b, c);
          break;
        default:
          throw new Error(`PNG row ${String(y)} uses filter ${String(filter)}`);
      }
      row[i] = v & 0xff;
    }
    for (let x = 0; x < width; x++) {
      rgb.set(row.subarray(x * channels, x * channels + 3), (y * width + x) * 3);
    }
    prev = row;
  }
  return { width, height, rgb };
}
