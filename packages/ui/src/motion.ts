/**
 * Whether what moves is to be shown already arrived: the system asks for it, or the app's own
 * setting does, which it marks on an ancestor.
 */
export function prefersStill(element: Element): boolean {
  return (
    matchMedia('(prefers-reduced-motion: reduce)').matches ||
    element.closest('[data-reduce-motion]') !== null
  );
}
