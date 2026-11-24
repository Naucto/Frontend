import type { Rgb } from './dither-field';

/** The wheel is cut in twelve; two colours kept are at least this many cuts apart. */
const BINS = 12;
const APART = 2;

/**
 * The colours a picture is made of, most present first, three at most, from RGBA pixels. Greys
 * and near-blacks say nothing of its mood and are passed over, so a picture may give fewer than
 * three, or none.
 */
export function coverHues(pixels: Uint8ClampedArray): Rgb[] {
  const bins = Array.from({ length: BINS }, (_, hue) => ({
    hue,
    weight: 0,
    red: 0,
    green: 0,
    blue: 0,
  }));
  for (let i = 0; i < pixels.length; i += 4) {
    const red = pixels[i] ?? 0;
    const green = pixels[i + 1] ?? 0;
    const blue = pixels[i + 2] ?? 0;
    const max = Math.max(red, green, blue);
    const spread = max - Math.min(red, green, blue);
    const saturation = max ? spread / max : 0;
    const value = max / 255;
    if (saturation < 0.25 || value < 0.2) {
      continue;
    }
    const sixth =
      max === red
        ? ((green - blue) / spread) % 6
        : max === green
          ? (blue - red) / spread + 2
          : (red - green) / spread + 4;
    const bin = bins[Math.floor(((sixth * 60 + 360) % 360) / 30) % BINS];
    if (bin) {
      const weight = saturation * value;
      bin.weight += weight;
      bin.red += red * weight;
      bin.green += green * weight;
      bin.blue += blue * weight;
    }
  }
  const kept: typeof bins = [];
  for (const bin of bins.filter((each) => each.weight > 0).sort((a, b) => b.weight - a.weight)) {
    const distinct = kept.every((other) => {
      const gap = Math.abs(other.hue - bin.hue);
      return Math.min(gap, BINS - gap) >= APART;
    });
    if (kept.length < 3 && distinct) {
      kept.push(bin);
    }
  }
  return kept.map((bin) => [bin.red / bin.weight, bin.green / bin.weight, bin.blue / bin.weight]);
}

/**
 * Three colours for three blobs, each at full brightness. What the picture did not give is made up
 * from its first colour with the channels turned; a picture that gave nothing leaves it all to
 * `fallback`.
 */
export function threeColours(found: readonly Rgb[], fallback: Rgb): Rgb[] {
  const bright = ([red, green, blue]: Rgb): Rgb => {
    const peak = Math.max(1, red, green, blue);
    return [(red * 255) / peak, (green * 255) / peak, (blue * 255) / peak];
  };
  const [first = bright(fallback), second, third] = found;
  const turned: Rgb = [first[2], first[0], first[1]];
  return [first, second ?? turned, third ?? turned].map(bright);
}
