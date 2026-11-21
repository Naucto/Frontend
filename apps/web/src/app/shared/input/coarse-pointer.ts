/** No fine pointer means a touch device, where the on-screen pad is the only way to play. */
export function coarsePointer(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
}
