export function getCanvasPoint2DFromEvent(
  e: React.MouseEvent<HTMLCanvasElement>
): Point2D {
  const canvas = e.currentTarget;
  const rect = canvas.getBoundingClientRect();

  const relX = e.clientX - rect.left;
  const relY = e.clientY - rect.top;

  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  const x = Math.max(0, Math.min(canvas.width  - 1, Math.floor(relX * scaleX)));
  const y = Math.max(0, Math.min(canvas.height - 1, Math.floor(relY * scaleY)));

  return { x, y };
}
