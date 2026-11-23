import {
  BANNER_REACH,
  BANNER_ROWS,
  type BannerSample,
  blobLayout,
  paintBanner,
  type PaintedBlob,
  paintField,
  rampOf,
  type Rgb,
} from './dither-field';

describe('rampOf', () => {
  const ground: Rgb = [10, 10, 10];
  const colour: Rgb = [255, 10, 110];

  it('starts on the ground and leaves it by a quarter at most on a dark page', () => {
    const ramp = rampOf(ground, colour, true);
    expect(ramp).toHaveLength(4);
    expect(ramp[0]).toEqual(ground);
    expect(ramp[3]![0]).toBeCloseTo(10 + 245 * 0.245);
    expect(ramp[3]![1]).toBe(10);
  });

  it('goes further on a light page', () => {
    expect(rampOf(ground, colour, false)[3]![0]).toBeCloseTo(10 + 245 * 0.4);
  });
});

describe('blobLayout', () => {
  it('places the same three blobs for the same seed', () => {
    expect(blobLayout('12')).toEqual(blobLayout('12'));
    expect(blobLayout('12')).toHaveLength(3);
  });

  it('places them elsewhere for another seed', () => {
    expect(blobLayout('12')).not.toEqual(blobLayout('13'));
  });

  it('keeps every blob a soft ellipse of a size the field can show', () => {
    for (const blob of blobLayout('hightide')) {
      expect(blob.rx).toBeGreaterThanOrEqual(0.42);
      expect(blob.rx).toBeLessThan(0.68);
      expect(blob.ry).toBeGreaterThanOrEqual(0.38);
      expect(blob.ry).toBeLessThan(0.62);
    }
  });
});

describe('paintField', () => {
  const ramp = (channel: number): Rgb[] =>
    [0, 1, 2, 3].map((step) => [channel, step * 10, 0] as const);
  const blobs: PaintedBlob[] = [
    { cx: 0.2, cy: 0.3, rx: 0.5, ry: 0.5, ramp: ramp(100) },
    { cx: 0.8, cy: 0.3, rx: 0.5, ry: 0.5, ramp: ramp(150) },
    { cx: 0.5, cy: 0.9, rx: 0.5, ry: 0.5, ramp: ramp(200) },
  ];
  const paint = (rows = 32): Uint8ClampedArray => {
    const data = new Uint8ClampedArray(48 * rows * 4);
    paintField(data, 48, 32, blobs, rows);
    return data;
  };
  const cells = (data: Uint8ClampedArray): string[] =>
    Array.from(
      { length: data.length / 4 },
      (_, i) => `${String(data[i * 4])},${String(data[i * 4 + 1])}`,
    );

  it('never blends: every cell is one step of the ramp of one blob', () => {
    const allowed = new Set(
      blobs.flatMap((blob) => blob.ramp.map(([red, green]) => `${String(red)},${String(green)}`)),
    );
    const painted = new Set(cells(paint()));
    expect([...painted].every((cell) => allowed.has(cell))).toBe(true);
    expect(painted.size).toBeGreaterThan(6);
  });

  it('goes deepest at the centre of a blob and stays on the ground far from all of them', () => {
    const data = paint();
    const at = (x: number, y: number): number => data[(y * 48 + x) * 4 + 1]!;
    expect(at(Math.round(0.2 * 48), Math.round(0.3 * 32))).toBe(30);
    expect(at(24, 0)).toBeLessThanOrEqual(10);
  });

  it('carries the same field on below its height, for a field slid up as the page scrolls', () => {
    const longer = cells(paint(40));
    expect(longer.slice(0, 48 * 32)).toEqual(cells(paint()));
    expect(new Set(longer.slice(48 * 32)).size).toBeGreaterThan(1);
  });
});

describe('paintBanner', () => {
  const WIDTH = 16;
  const ground: Rgb = [0, 0, 0];
  /** A picture whose every cell is white, and whose last row is red. */
  const banner: BannerSample = {
    width: WIDTH,
    rows: BANNER_ROWS,
    data: Uint8ClampedArray.from({ length: WIDTH * BANNER_ROWS * 4 }, (_, i) =>
      i >= WIDTH * (BANNER_ROWS - 1) * 4 && i % 4 !== 0 ? 0 : 255,
    ),
  };
  const paint = (): Uint8ClampedArray => {
    const data = new Uint8ClampedArray(WIDTH * BANNER_REACH * 4);
    paintBanner(data, WIDTH, banner, ground, true);
    return data;
  };
  const kept = (data: Uint8ClampedArray, y: number): number =>
    Array.from({ length: WIDTH }, (_, x) => data[(y * WIDTH + x) * 4 + 3]).filter(
      (alpha) => alpha === 255,
    ).length;

  it('lays the picture whole at its top, pulled toward the ground', () => {
    const data = paint();
    expect(kept(data, 0)).toBe(WIDTH);
    expect(kept(data, 99)).toBe(WIDTH);
    expect(data[0]).toBe(140);
  });

  it('lets go of it in a dither down to nothing, every dropped cell left transparent', () => {
    const data = paint();
    const shares = [120, 200, 300].map((y) => kept(data, y));
    expect(shares[0]).toBeGreaterThan(shares[1]!);
    expect(shares[1]).toBeGreaterThan(shares[2]!);
    expect(kept(data, BANNER_REACH - 1)).toBe(0);
    const alphas = new Set(data.filter((_, i) => i % 4 === 3));
    expect([...alphas].sort()).toEqual([0, 255]);
  });

  it('runs the last row of the picture on under it', () => {
    const data = paint();
    const at =
      (200 * WIDTH +
        Array.from({ length: WIDTH }).findIndex(
          (_, x) => data[(200 * WIDTH + x) * 4 + 3] === 255,
        )) *
      4;
    expect([data[at], data[at + 1], data[at + 2]]).toEqual([140, 0, 0]);
  });
});
