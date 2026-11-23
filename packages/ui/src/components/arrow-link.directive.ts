import { Directive } from '@angular/core';

/** The arrow up and to the right, five kit pixels square, as a mask the link's ink fills. */
const ARROW =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='15' height='15' viewBox='0 0 5 5' shape-rendering='crispEdges'%3E%3Cpath d='M1 0h4v1H1zM4 1h1v3H4zM3 1h1v1H3zM2 2h1v1H2zM1 3h1v1H1zM0 4h1v1H0z'/%3E%3C/svg%3E\")";

/**
 * A link that leads to a page of its own: the gold words in capitals, the arrow after them. It
 * puts no `href` of its own, so `routerLink` or `href` sit on the same `<a>`.
 *
 * It stays still on hover, as the design's links do: the glare belongs to coloured calls to action.
 */
@Directive({
  selector: 'a[ncArrowLink]',
  host: {
    class:
      'inline-flex w-fit items-center gap-[6px] text-label leading-[1.5] tracking-wide text-gold-ink uppercase ' +
      'after:size-[15px] after:shrink-0 after:bg-current after:[mask-image:var(--nc-arrow)]',
    '[style.--nc-arrow]': 'arrow',
  },
})
export class ArrowLinkDirective {
  protected readonly arrow = ARROW;
}
