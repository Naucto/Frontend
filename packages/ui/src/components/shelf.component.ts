import { NgTemplateOutlet } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  contentChild,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  linkedSignal,
  model,
  numberAttribute,
  signal,
  viewChild,
} from '@angular/core';

import { MarkComponent } from './mark.component';
import { PagerComponent } from './pager.component';
import { ShelfFlyoutComponent } from './shelf-flyout.component';
import { ShelfFlyoutDirective, ShelfItemDirective } from './shelf-item.directive';
import {
  type FlyoutPlacement,
  flyoutPlacement,
  SHELF_GAP,
  SHELF_PEEK,
  shelfLayout,
  shelfPlace,
} from './shelf-layout';

/** How long the pointer rests on an item before its flyout opens. */
const HOVER_DELAY = 1000;
/** The veil over a neighbouring page: its frame at rest, and while the item next to it is reached. */
const VEIL = 8;
const VEIL_LIFTED = 4;
/** One step of a veil arriving or leaving. */
const VEIL_STEP = 40;
/** The four dither layers that dim the shelf behind a flyout come and go this far apart. */
const DIM_STAGGER = 45;

interface Swipe {
  x: number;
  y: number;
  id: number;
  mouse: boolean;
  axis: 'x' | 'y' | null;
}

let shelves = 0;

/**
 * A titled row that pages through more items than fit: as many per page as the width takes, the
 * neighbouring pages showing through a dither at both ends. Paged by its arrows, its dots, the
 * left and right keys, or a swipe that resists at either end; a vertical swipe stays the page's.
 * With `rows`, a page is that many rows high and is filled row by row.
 *
 * What an item is drawn as is the caller's (`*ncShelfItem`). With a `*ncShelfFlyout`, an item that
 * is reached opens a frame beside it holding that template: after a second under the mouse, at
 * once under keyboard focus, on the first tap of a finger, whose second tap is then the item's
 * own. The item says so through `aria-expanded`, `aria-controls` and `aria-describedby`, from the
 * `open` and `flyoutId` its template is given.
 *
 * `--nc-page-gutter` is the page's side padding: the arrows stand in it when it is wide enough.
 */
@Component({
  selector: 'nc-shelf',
  imports: [NgTemplateOutlet, MarkComponent, PagerComponent, ShelfFlyoutComponent],
  templateUrl: './shelf.component.html',
  styleUrl: './shelf.component.css',
  host: {
    class: 'relative grid min-w-0 gap-[18px]',
    role: 'region',
    'aria-roledescription': 'carousel',
    '[attr.aria-labelledby]': 'ids.heading',
    '[class.by-keys]': 'byKeys()',
    '(keydown)': 'onKey($event)',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShelfComponent<T> {
  readonly heading = input.required<string>();
  /** The page shown, from 0. */
  readonly page = model(0);
  /** How many rows high a page is, from 1 to 4. */
  readonly rows = input(1, {
    transform: (value: unknown) => Math.max(1, Math.min(4, Math.round(numberAttribute(value, 1)))),
  });
  readonly previousLabel = input('Previous page');
  readonly nextLabel = input('Next page');
  readonly pagesLabel = input('Pages');
  readonly pageLabel = input('Page');
  /** What is announced when the page changes. */
  readonly pageStatus = input(
    (page: number, pages: number): string => `Page ${String(page)} of ${String(pages)}`,
  );
  /** What an item is called by its place in the row. */
  readonly positionLabel = input(
    (position: number, count: number): string => `${String(position)} of ${String(count)}`,
  );

  private readonly slot = contentChild.required<ShelfItemDirective<T>>(ShelfItemDirective);
  protected readonly flyout = contentChild<ShelfFlyoutDirective<T>>(ShelfFlyoutDirective);
  protected readonly template = computed(() => this.slot().template);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly injector = inject(Injector);
  private readonly track = viewChild.required<ElementRef<HTMLElement>>('track');

  private readonly serial = ++shelves;
  protected readonly ids = {
    heading: `nc-shelf-${String(this.serial)}-heading`,
    rail: `nc-shelf-${String(this.serial)}-rail`,
  };

  /** The track's width; until it is measured, a desktop's. */
  private readonly width = signal(1100);
  protected readonly layout = computed(() =>
    shelfLayout(this.width(), this.slot().ncShelfItemOf().length, this.rows()),
  );
  protected readonly current = computed(() => Math.min(this.page(), this.layout().pages - 1));

  /** The item whose flyout is open, and the column the mouse is over; -1 for none. */
  protected readonly active = signal(-1);
  private readonly hovered = signal(-1);
  /** Whether the open flyout was reached by the keyboard, which stacks it without delay. */
  protected readonly byKeys = signal(false);
  /** How far a swipe has pulled the rail; null when none is under way. */
  protected readonly pull = signal<number | null>(null);

  protected readonly cells = computed(() => {
    const { per, itemWidth } = this.layout();
    const current = this.current();
    const speaks = this.flyout()?.ncShelfFlyoutWhen();
    return this.slot()
      .ncShelfItemOf()
      .map((item, index) => {
        const { page, row, column } = shelfPlace(index, per, this.rows());
        return {
          item,
          page,
          gridRow: row + 1,
          gridColumn: page * per + column + 1,
          near: Math.abs(page - current) <= 1,
          placement:
            page === current && speaks?.(item)
              ? flyoutPlacement(this.width(), itemWidth, column)
              : null,
        };
      });
  });

  protected readonly left = computed(() => {
    const { per, itemWidth } = this.layout();
    return -this.current() * per * (itemWidth + SHELF_GAP) + (this.pull() ?? 0);
  });

  /** The part of the window the open flyout covers, which the dithered ends must not cut. */
  protected readonly opening = computed(() => {
    const placement = this.cells()[this.active()]?.placement;
    return placement
      ? { x: SHELF_PEEK + placement.left - 8, width: placement.width + 16 }
      : { x: 0, width: 0 };
  });

  /** A veil's frame, and how many steps it takes to get there from where it was. */
  private veil(frame: () => number): () => { frame: number; steps: number } {
    return linkedSignal<number, { frame: number; steps: number }>({
      source: frame,
      computation: (to, from) => ({
        frame: to,
        steps: Math.abs(to - (from?.source ?? 0)) || (from?.value.steps ?? VEIL),
      }),
    });
  }
  private readonly veilFrame = (column: number): number =>
    this.hovered() === column ? VEIL_LIFTED : VEIL;
  private readonly veilBefore = this.veil(() =>
    this.current() > 0 && this.active() < 0 ? this.veilFrame(0) : 0,
  );
  private readonly veilAfter = this.veil(() =>
    this.current() < this.layout().pages - 1 && this.active() < 0
      ? this.veilFrame(this.layout().per - 1)
      : 0,
  );
  protected readonly veils = computed(() =>
    [this.veilBefore(), this.veilAfter()].map(({ frame, steps }) => ({
      shown: frame > 0,
      position: `${String(-frame * SHELF_PEEK)}px 0`,
      transition: `mask-position ${String(steps * VEIL_STEP)}ms steps(${String(steps)}, end)`,
    })),
  );

  /** The layers arrive first to last and leave last to first. */
  protected readonly dim = computed(() =>
    [0, 1, 2, 3].map((layer) => (this.active() >= 0 ? layer : 3 - layer) * DIM_STAGGER),
  );

  private timer: ReturnType<typeof setTimeout> | undefined;
  private swipe: Swipe | null = null;
  private swiped = false;
  private pointer = 'mouse';

  protected flyoutId(index: number): string {
    return `nc-shelf-${String(this.serial)}-flyout-${String(index)}`;
  }

  protected close(): void {
    clearTimeout(this.timer);
    this.active.set(-1);
  }

  protected go(page: number): void {
    if (page < 0 || page >= this.layout().pages) {
      return;
    }
    this.page.set(page);
    this.close();
  }

  protected enter(event: PointerEvent, index: number, placement: FlyoutPlacement | null): void {
    if (event.pointerType !== 'mouse' || this.swipe?.axis) {
      return;
    }
    this.hovered.set(index % this.layout().per);
    clearTimeout(this.timer);
    if (placement) {
      this.timer = setTimeout(() => {
        this.byKeys.set(false);
        this.active.set(index);
      }, HOVER_DELAY);
    }
  }

  protected leave(event: PointerEvent): void {
    if (event.pointerType !== 'mouse') {
      return;
    }
    this.close();
    this.hovered.set(-1);
  }

  protected focusIn(event: FocusEvent, index: number, placement: FlyoutPlacement | null): void {
    if (!placement || !(event.target as Element).matches(':focus-visible')) {
      return;
    }
    clearTimeout(this.timer);
    this.byKeys.set(true);
    this.active.set(index);
    this.hovered.set(-1);
  }

  protected focusOut(event: FocusEvent, index: number): void {
    // A finger's flyout stays until something else is touched: there is no leaving to see.
    if (this.pointer !== 'mouse' || this.active() !== index) {
      return;
    }
    const next = event.relatedTarget instanceof Element ? event.relatedTarget : null;
    if (!next?.closest('[role="listitem"]') || !this.host.contains(next)) {
      this.active.set(-1);
    }
  }

  protected onKey(event: KeyboardEvent): void {
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
      return;
    }
    if (event.key === 'Escape' && this.active() >= 0) {
      event.preventDefault();
      this.close();
      return;
    }
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') {
      return;
    }
    event.preventDefault();
    const pages = this.layout().pages;
    this.go((this.current() + (event.key === 'ArrowRight' ? 1 : -1) + pages) % pages);
    if (target.closest('[role="listitem"]')) {
      // The item that had the focus is inert now: it moves to the first of the page that came.
      afterNextRender(
        () => {
          this.host
            .querySelector<HTMLElement>(
              '[role="listitem"]:not([inert]) > .lift :is(a[href], button)',
            )
            ?.focus({ preventScroll: true });
        },
        { injector: this.injector },
      );
    }
  }

  protected down(event: PointerEvent): void {
    this.pointer = event.pointerType;
    if (event.pointerType !== 'mouse' || event.button === 0) {
      this.swipe = {
        x: event.clientX,
        y: event.clientY,
        id: event.pointerId,
        mouse: event.pointerType === 'mouse',
        axis: null,
      };
    }
  }

  protected move(event: PointerEvent): void {
    const swipe = this.swipe;
    if (!swipe) {
      return;
    }
    const dx = event.clientX - swipe.x;
    const dy = event.clientY - swipe.y;
    if (!swipe.axis) {
      if (Math.abs(dx) < (swipe.mouse ? 5 : 8) && Math.abs(dy) < 8) {
        return;
      }
      // A mouse has no page to scroll by dragging, so its drag is always the shelf's.
      swipe.axis = swipe.mouse || Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (swipe.axis === 'x') {
        this.close();
        this.hovered.set(-1);
        if (swipe.mouse) {
          this.track().nativeElement.setPointerCapture(swipe.id);
        }
      }
    }
    if (swipe.axis === 'x') {
      const atEnd =
        (dx > 0 && this.current() === 0) || (dx < 0 && this.current() >= this.layout().pages - 1);
      this.pull.set(atEnd ? dx / 3 : dx);
    }
  }

  protected up(): void {
    const pulled = this.pull();
    this.swipe = null;
    if (pulled === null) {
      return;
    }
    this.pull.set(null);
    // The click that ends a drag is not a click on what was dragged.
    this.swiped = true;
    setTimeout(() => {
      this.swiped = false;
    });
    const threshold = Math.max(50, this.width() * 0.15);
    if (Math.abs(pulled) >= threshold) {
      this.go(this.current() - Math.sign(pulled));
    }
  }

  constructor() {
    // In the capture phase, so the link under the pointer never hears a click that is not one.
    const onClick = (event: MouseEvent): void => {
      const item = (event.target as Element).closest<HTMLElement>('[role="listitem"]');
      const index = Number(item?.dataset.index ?? -1);
      const firstTap =
        this.pointer !== 'mouse' && index !== this.active() && !!this.cells()[index]?.placement;
      if (this.swiped || firstTap) {
        event.preventDefault();
        event.stopPropagation();
      }
      if (firstTap && !this.swiped) {
        clearTimeout(this.timer);
        this.byKeys.set(false);
        this.active.set(index);
      }
      this.swiped = false;
    };
    this.host.addEventListener('click', onClick, true);
    inject(DestroyRef).onDestroy(() => {
      this.host.removeEventListener('click', onClick, true);
      clearTimeout(this.timer);
    });

    effect((onCleanup) => {
      const track = this.track().nativeElement;
      const observer = new ResizeObserver(([entry]) => {
        // A shelf that is not laid out measures nothing, and has nothing to page by.
        if (entry?.contentRect.width) {
          this.width.set(Math.round(entry.contentRect.width));
        }
      });
      observer.observe(track);
      onCleanup(() => {
        observer.disconnect();
      });
    });
  }
}
