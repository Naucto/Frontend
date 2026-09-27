import type { Game } from '@naucto/engine';

/** A sheet or map drawn at native resolution from the document's own pixels. */
export function renderResource(game: Game, kind: 'sheet' | 'map', id: string): string | null {
  const palette = game.palette;
  const canvas = document.createElement('canvas');
  const ctx = (): CanvasRenderingContext2D => {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas unavailable');

    return context;
  };
  if (kind === 'sheet') {
    const sheet = game.sheets.find((s) => s.id === id);
    if (!sheet) return null;
    canvas.width = sheet.width;
    canvas.height = sheet.height;
    const image = ctx().createImageData(sheet.width, sheet.height);
    for (let i = 0; i < sheet.pixels.length; i++) paint(image, i, palette, sheet.pixels[i] ?? 0);
    ctx().putImageData(image, 0, 0);
  } else {
    const map = game.maps.find((m) => m.id === id);
    if (!map) return null;
    canvas.width = map.width * 8;
    canvas.height = map.height * 8;
    const image = ctx().createImageData(canvas.width, canvas.height);
    for (let ty = 0; ty < map.height; ty++)
      for (let tx = 0; tx < map.width; tx++) {
        const sprite = map.getTile(tx, ty);
        if (!sprite) continue;
        const sheet = game.sheets.find((s) => s.holds(sprite));
        if (!sheet) continue;
        const origin = sheet.originOf(sprite);
        for (let py = 0; py < 8; py++)
          for (let px = 0; px < 8; px++)
            paint(
              image,
              (ty * 8 + py) * canvas.width + tx * 8 + px,
              palette,
              sheet.getPixel(origin.x + px, origin.y + py),
            );
      }
    ctx().putImageData(image, 0, 0);
  }

  return canvas.toDataURL('image/png');
}

/** Index 0 is the transparent colour, as it is on screen. */
function paint(image: ImageData, index: number, palette: readonly string[], colour: number): void {
  if (colour === 0) return;
  const hex = palette[colour] ?? '#000000';
  image.data[index * 4] = parseInt(hex.slice(1, 3), 16);
  image.data[index * 4 + 1] = parseInt(hex.slice(3, 5), 16);
  image.data[index * 4 + 2] = parseInt(hex.slice(5, 7), 16);
  image.data[index * 4 + 3] = 255;
}
