const SCREEN_WIDTH = 320;
const SCREEN_HEIGHT = 180;

/**
 * A frame read back from the engine as a PNG, scaled by a whole number with no smoothing so every
 * pixel stays a hard square. Drawn off screen, so it needs no document. Null when the browser
 * cannot draw it.
 */
export async function frameToPng(rgba: Uint8ClampedArray, scale = 1): Promise<Blob | null> {
  const width = Math.round(Math.sqrt((rgba.length / 4) * (SCREEN_WIDTH / SCREEN_HEIGHT)));
  const frame = await createImageBitmap(
    new ImageData(rgba as Uint8ClampedArray<ArrayBuffer>, width),
  );
  const canvas = new OffscreenCanvas(SCREEN_WIDTH * scale, SCREEN_HEIGHT * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    frame.close();
    return null;
  }
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(frame, 0, 0, canvas.width, canvas.height);
  frame.close();
  return canvas.convertToBlob({ type: 'image/png' });
}
