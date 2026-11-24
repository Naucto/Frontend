import { coverHues, threeColours } from './cover-palette';
import type { Rgb } from './dither-field';

function pixels(...runs: (readonly [Rgb, number])[]): Uint8ClampedArray {
  return new Uint8ClampedArray(
    runs.flatMap(([colour, count]) => Array.from({ length: count }, () => [...colour, 255]).flat()),
  );
}

describe('coverHues', () => {
  it('gives the colours a picture is made of, most present first', () => {
    const hues = coverHues(pixels([[0, 120, 153], 60], [[255, 209, 0], 20], [[255, 38, 116], 5]));
    expect(hues.map((hue) => hue.map(Math.round))).toEqual([
      [0, 120, 153],
      [255, 209, 0],
      [255, 38, 116],
    ]);
  });

  it('passes over greys and near-blacks, which say nothing of the mood', () => {
    expect(
      coverHues(pixels([[120, 120, 120], 50], [[20, 4, 4], 50], [[250, 250, 250], 50])),
    ).toEqual([]);
  });

  it('keeps one of two colours that sit side by side on the wheel', () => {
    const hues = coverHues(pixels([[0, 120, 153], 60], [[0, 40, 89], 60]));
    expect(hues).toHaveLength(1);
  });
});

describe('threeColours', () => {
  it('brightens each colour until its strongest channel is full', () => {
    expect(threeColours([[0, 60, 120]], [0, 0, 0])[0]).toEqual([0, 127.5, 255]);
  });

  it('makes up what the picture did not give by turning the channels of its first colour', () => {
    const [first, second, third] = threeColours([[255, 0, 100]], [9, 9, 9]);
    expect(first).toEqual([255, 0, 100]);
    expect(second).toEqual([100, 255, 0]);
    expect(third).toEqual(second);
  });

  it('falls back on the colour it is given when the picture gave nothing', () => {
    expect(threeColours([], [0, 120, 153])[0]).toEqual([0, 200, 255]);
  });
});
