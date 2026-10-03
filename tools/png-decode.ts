import { inflateSync } from 'node:zlib';

/** The counterpart of `png.ts` for 8-bit RGB or RGBA, non-interlaced; any other shape is refused rather than misread. */

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export interface DecodedPng {
  width: number;
  height: number;
  /** width × height × 3 bytes, row-major. An alpha channel, when the file has one, is dropped. */
  rgb: Uint8Array;
}

// PNG spec 9.4: the predictor that picks whichever neighbour is closest to the gradient estimate.
function paeth(left: number, above: number, upLeft: number): number {
  const estimate = left + above - upLeft;
  const pa = Math.abs(estimate - left);
  const pb = Math.abs(estimate - above);
  const pc = Math.abs(estimate - upLeft);
  if (pa <= pb && pa <= pc) {
    return left;
  }
  return pb <= pc ? above : upLeft;
}

export function decodePng(bytes: Uint8Array): DecodedPng {
  if (SIGNATURE.some((expected, i) => bytes[i] !== expected)) {
    throw new Error('not a PNG');
  }
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
    } else if (type === 'IDAT') {
      idat.push(body);
    } else if (type === 'IEND') {
      break;
    }
    at += 12 + length;
  }
  if (!channels) {
    throw new Error('PNG without IHDR');
  }

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
      const left = i >= channels ? (row[i - channels] ?? 0) : 0;
      const above = prev[i] ?? 0;
      const upLeft = i >= channels ? (prev[i - channels] ?? 0) : 0;
      let value: number;
      switch (filter) {
        case 0:
          value = x;
          break;
        case 1:
          value = x + left;
          break;
        case 2:
          value = x + above;
          break;
        case 3:
          value = x + ((left + above) >> 1);
          break;
        case 4:
          value = x + paeth(left, above, upLeft);
          break;
        default:
          throw new Error(`PNG row ${String(y)} uses filter ${String(filter)}`);
      }
      row[i] = value & 0xff;
    }
    for (let x = 0; x < width; x++) {
      rgb.set(row.subarray(x * channels, x * channels + 3), (y * width + x) * 3);
    }
    prev = row;
  }
  return { width, height, rgb };
}
