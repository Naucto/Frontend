import { Directive } from '@angular/core';

/**
 * Buttons set side by side as one strip. Each shares its side edge with the next, as the tabs of
 * a strip do, and the one pointed at, focused or latched is drawn over its neighbours: a ghost
 * button has no frame until then, so the strip is laid on a well and a line runs between its
 * cells: it reads as one block before the pointer is on it.
 */
@Directive({
  selector: '[ncJoined]',
  host: {
    class:
      'inline-flex bg-inset [&>*]:relative [&>*+*]:-ml-[3px] [&>*:hover]:z-1 ' +
      '[&>*:focus-visible]:z-1 [&>[data-pressed]]:z-1 ' +
      '[&>*+*]:before:absolute [&>*+*]:before:inset-y-0 [&>*+*]:before:left-0 ' +
      '[&>*+*]:before:w-[3px] [&>*+*]:before:bg-line',
  },
})
export class JoinedDirective {}
