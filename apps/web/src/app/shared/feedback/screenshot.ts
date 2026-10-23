/** What the server accepts for a bug screenshot. */
export const SCREENSHOT_MAX_BYTES = 2 * 1024 * 1024;
/** The longest edge a screenshot is sent at. A 4K capture reads just as well at half. */
export const SCREENSHOT_MAX_EDGE = 1920;

export class ScreenshotTooLargeError extends Error {}
export class ScreenshotUnreadableError extends Error {}

const encode = (canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> =>
  new Promise((resolve) => {
    canvas.toBlob(resolve, type, quality);
  });

/** The size an image is drawn at so that its longest edge fits, never enlarged. */
export function fitWithin(
  width: number,
  height: number,
  maxEdge = SCREENSHOT_MAX_EDGE,
): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/**
 * Any image a browser can decode, as one the server takes: brought within the edge, then encoded
 * as WebP, falling back to JPEG when WebP is unavailable or still too heavy. An image that is
 * already a small PNG, as a game frame is, goes untouched so its pixels stay exact.
 */
export async function prepareScreenshot(image: Blob): Promise<Blob> {
  if (image.type === 'image/png' && image.size <= SCREENSHOT_MAX_BYTES) {
    const bitmap = await createImageBitmap(image).catch(() => null);
    if (bitmap && Math.max(bitmap.width, bitmap.height) <= SCREENSHOT_MAX_EDGE) {
      bitmap.close();
      return image;
    }
    bitmap?.close();
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(image);
  } catch {
    throw new ScreenshotUnreadableError();
  }
  const size = fitWithin(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, size.width, size.height);
  bitmap.close();

  const webp = await encode(canvas, 'image/webp', 0.85);
  if (webp?.type === 'image/webp' && webp.size <= SCREENSHOT_MAX_BYTES) {
    return webp;
  }
  const jpeg = await encode(canvas, 'image/jpeg', 0.8);
  if (jpeg && jpeg.size <= SCREENSHOT_MAX_BYTES) {
    return jpeg;
  }
  throw new ScreenshotTooLargeError();
}

/**
 * Waits for frames the capture delivered after now, so the picture is of the page as it is once
 * the dialog is hidden, not as it was a moment before. A page that does not change may send no
 * new frame at all, so the wait is bounded.
 */
function freshFrames(video: HTMLVideoElement, count: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 400);
    if (typeof video.requestVideoFrameCallback !== 'function') {
      return;
    }
    let left = count;
    const next = (): void => {
      left -= 1;
      if (left <= 0) {
        resolve();
      } else {
        video.requestVideoFrameCallback(next);
      }
    };
    video.requestVideoFrameCallback(next);
  });
}

export const canCaptureScreen = (): boolean =>
  typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getDisplayMedia === 'function';

/**
 * One frame of what the person picks to share, the tab by preference. The browser asks first, and
 * the capture stops as soon as the frame is read. `hide` runs around the grab so the dialog asking
 * for it is not in the picture.
 */
export async function captureScreen(hide: (hidden: boolean) => void): Promise<Blob | null> {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: false,
    preferCurrentTab: true,
  } as DisplayMediaStreamOptions);
  try {
    const video = document.createElement('video');
    video.muted = true;
    video.srcObject = stream;
    await video.play();
    hide(true);
    await freshFrames(video, 2);
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    video.srcObject = null;
    return await encode(canvas, 'image/png');
  } finally {
    hide(false);
    for (const track of stream.getTracks()) {
      track.stop();
    }
  }
}
