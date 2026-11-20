import { Directive, inject, input, TemplateRef } from '@angular/core';

export interface ShelfItemContext<T> {
  $implicit: T;
  index: number;
  /** Whether this item's flyout is open: what it shows of itself while it is. */
  open: boolean;
  /** The id of this item's flyout, for the link's `aria-controls`; null where it has none. */
  flyoutId: string | null;
}

/** What a shelf draws for each item: `*ncShelfItem="let game of games; open as open"`. */
@Directive({ selector: '[ncShelfItem]' })
export class ShelfItemDirective<T> {
  readonly ncShelfItemOf = input.required<readonly T[]>();
  readonly template = inject<TemplateRef<ShelfItemContext<T>>>(TemplateRef);

  static ngTemplateContextGuard<T>(
    _directive: ShelfItemDirective<T>,
    context: unknown,
  ): context is ShelfItemContext<T> {
    return typeof context === 'object';
  }
}

export interface ShelfFlyoutContext<T> {
  $implicit: T;
  index: number;
}

/**
 * What a shelf says of an item beside it once it is reached:
 * `*ncShelfFlyout="let game of games"`. A shelf without one opens nothing.
 */
@Directive({ selector: '[ncShelfFlyout]' })
export class ShelfFlyoutDirective<T> {
  /** Names the list only so the template knows what an item is; the shelf reads its items once. */
  readonly ncShelfFlyoutOf = input<readonly T[]>();
  /** The items that have something to say; the others open nothing. */
  readonly ncShelfFlyoutWhen = input<(item: T) => boolean>(() => true);
  readonly template = inject<TemplateRef<ShelfFlyoutContext<T>>>(TemplateRef);

  static ngTemplateContextGuard<T>(
    _directive: ShelfFlyoutDirective<T>,
    context: unknown,
  ): context is ShelfFlyoutContext<T> {
    return typeof context === 'object';
  }
}
