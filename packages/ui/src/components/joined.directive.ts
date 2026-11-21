import { Directive } from '@angular/core';

/**
 * Buttons set side by side as one strip. Each shares its side edge with the next, as the tabs of
 * a strip do, and the one pointed at, focused or latched is drawn over its neighbours: a ghost
 * button has no frame until then, so the strip shows a frame only where the pointer is.
 */
@Directive({
  selector: '[ncJoined]',
  host: {
    class:
      'inline-flex [&>*]:relative [&>*+*]:-ml-[3px] [&>*:hover]:z-1 [&>*:focus-visible]:z-1 ' +
      '[&>[data-pressed]]:z-1',
  },
})
export class JoinedDirective {}
