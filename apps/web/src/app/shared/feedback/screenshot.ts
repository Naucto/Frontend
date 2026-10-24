/** The longest edge a screenshot is sent at. A 4K capture reads just as well at half. */
export const SCREENSHOT_MAX_EDGE = 1920;

export class ScreenshotUnreadableError extends Error {}

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
 * Any image a browser can decode, made light to send: brought within the edge and encoded as WebP,
 * or JPEG where the browser has no WebP encoder. Whether it is light enough is the server's call.
 */
export async function prepareScreenshot(image: Blob): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(image);
  } catch {
    throw new ScreenshotUnreadableError();
  }
  const size = fitWithin(bitmap.width, bitmap.height);
  const canvas = new OffscreenCanvas(size.width, size.height);
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, size.width, size.height);
  bitmap.close();

  const webp = await canvas.convertToBlob({ type: 'image/webp', quality: 0.85 });
  return webp.type === 'image/webp'
    ? webp
    : canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
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
 * for it is not in the picture. A capture plays in a video element, which no browser lets go
 * without, so the caller lends its document for one.
 */
export async function captureScreen(
  doc: Document,
  hide: (hidden: boolean) => void,
): Promise<Blob | null> {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: false,
    preferCurrentTab: true,
  } as DisplayMediaStreamOptions);
  try {
    const video = doc.createElement('video');
    video.muted = true;
    video.srcObject = stream;
    await video.play();
    hide(true);
    await freshFrames(video, 2);
    const frame = await createImageBitmap(video);
    video.srcObject = null;
    const canvas = new OffscreenCanvas(frame.width, frame.height);
    canvas.getContext('2d')?.drawImage(frame, 0, 0);
    frame.close();
    return await canvas.convertToBlob({ type: 'image/png' });
  } finally {
    hide(false);
    for (const track of stream.getTracks()) {
      track.stop();
    }
  }
}
