const SCREEN_WIDTH = 320;
const SCREEN_HEIGHT = 180;

/**
 * A frame read back from the engine as a PNG, scaled by a whole number with no smoothing so every
 * pixel stays a hard square. Null when the browser cannot draw it.
 */
export async function frameToPng(rgba: Uint8ClampedArray, scale = 1): Promise<Blob | null> {
  const width = Math.round(Math.sqrt((rgba.length / 4) * (SCREEN_WIDTH / SCREEN_HEIGHT)));
  const image = new ImageData(rgba as Uint8ClampedArray<ArrayBuffer>, width);
  const source = document.createElement('canvas');
  source.width = image.width;
  source.height = image.height;
  source.getContext('2d')?.putImageData(image, 0, 0);

  const canvas = document.createElement('canvas');
  canvas.width = SCREEN_WIDTH * scale;
  canvas.height = SCREEN_HEIGHT * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return null;
  }
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/png');
  });
}
