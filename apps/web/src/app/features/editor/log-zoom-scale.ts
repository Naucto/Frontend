/**
 * A zoom slider's track over `[min, max]`, from 0 to 1.
 *
 * Geometric, so the same travel is the same ratio of magnification wherever on the track it is
 * spent: a linear one would give most of its length to the low scales, where there is nothing to
 * do, and crush the high ones together.
 */
export function logZoomScale(
  min: number,
  max: number,
): { positionOf(zoom: number): number; zoomAt(position: number): number } {
  const octaves = Math.log2(max / min);
  return {
    positionOf: (zoom) => Math.log2(zoom / min) / octaves,
    zoomAt: (position) => min * Math.pow(2, position * octaves),
  };
}
