import type { Rgb } from './dither-field';

/** Any CSS colour as its channels, by letting a canvas resolve it. */
export function channels(colour: string): Rgb {
  const context = Object.assign(document.createElement('canvas'), {
    width: 1,
    height: 1,
  }).getContext('2d', { willReadFrequently: true });
  if (!context) {
    return [0, 0, 0];
  }
  context.fillStyle = colour;
  context.fillRect(0, 0, 1, 1);
  const [red = 0, green = 0, blue = 0] = context.getImageData(0, 0, 1, 1).data;
  return [red, green, blue];
}

/** The page's own colour where `element` stands, which is the theme's, and whether it is dark. */
export function pageGround(element: Element): { ground: Rgb; dark: boolean } {
  const ground = channels(getComputedStyle(element).getPropertyValue('--nc-page'));
  return { ground, dark: 0.299 * ground[0] + 0.587 * ground[1] + 0.114 * ground[2] < 128 };
}
