import type { CdkDragDrop } from '@angular/cdk/drag-drop';
import { CdkDrag, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';
import type { ElementRef } from '@angular/core';
import {
  afterRenderEffect,
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  model,
  output,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';

import { type IconName } from '../icons/paths';
import { IconComponent } from './icon.component';

export interface TabItem<T extends string> {
  value: T;
  label: string;
  badge?: string | number;
  icon?: IconName;
  /** Its place in the list, drawn before the name. */
  index?: number;
  /** A colour the tab is marked with, as a CSS colour. Nothing is drawn without one. */
  colour?: string;
}

/** Which strip this is; the design draws them quite differently. */
export type TabsVariant = 'panel' | 'console' | 'small' | 'bar';

/**
 * `frame` dresses the strip as a whole — its rule, its height, its ground — and `list` dresses the
 * run of tabs inside it, which is the part that scrolls. Anything that must stay put when the tabs
 * slide belongs to the frame. `label` dresses the name alone, apart from the number, the swatch and
 * the buttons beside it.
 */
const VARIANT: Record<
  TabsVariant,
  { frame: string; list: string; item: string; label: string; icon: 12 | 24 }
> = {
  // Settings and other page-level strips: the UI face, inset from the edge, and the active tab
  // marked in ink. Gold is a primary action here, not a selection.
  panel: {
    frame: 'border-b border-line',
    list: 'gap-[6px] px-2.75',
    item: [
      '-mb-px flex items-center gap-1 border-b-2 border-transparent px-1.5 pt-1 pb-1.25',
      'font-ui text-meta uppercase tracking-tag text-ink-3 transition-colors hover:text-ink',
      'aria-selected:border-ink aria-selected:text-ink',
    ].join(' '),
    label: '',
    icon: 12,
  },
  // Sits directly on the thing it chooses between, so it carries no rule of its own and marks the
  // selection in gold.
  small: {
    frame: '',
    list: 'gap-px',
    item: [
      '-mb-px flex h-2.5 shrink-0 items-center gap-0.5 border-b-2 border-transparent px-1',
      // Sentence case: these are names somebody typed.
      'font-ui text-body tracking-copy text-ink-3 transition-colors hover:text-ink',
      'aria-selected:border-gold aria-selected:text-gold-ink',
    ].join(' '),
    // The cut falls on the name and never on the tab, so the number, the swatch and the buttons
    // keep their width beside a long name.
    label: 'max-w-[14ch] truncate',
    icon: 12,
  },
  // A bar of its own, full height, where the tabs are the primary subject of the screen below.
  bar: {
    frame: 'h-(--nc-bar-h) border-b border-line bg-panel',
    list: 'items-stretch',
    item: [
      'flex shrink-0 items-center gap-1 border-t-2 border-r border-r-line border-t-transparent px-[15px]',
      'font-ui text-body tracking-copy text-ink-3 transition-colors hover:text-ink',
      'aria-selected:border-t-gold aria-selected:bg-paper aria-selected:text-ink',
    ].join(' '),
    label: '',
    icon: 24,
  },
  // The editor console: mono, full-bleed in its column, and jade — the colour the machine talks in.
  console: {
    frame: 'border-b border-line',
    list: '',
    item: [
      '-mb-px flex h-4 items-center gap-1 border-b-2 border-transparent px-[14px]',
      'font-mono text-meta uppercase tracking-strip text-ink-3 transition-colors hover:text-ink',
      'aria-selected:border-jade aria-selected:text-jade-ink',
    ].join(' '),
    label: '',
    icon: 12,
  },
};

/**
 * A strip of tabs, from a page's own navigation to a picker over the thing it chooses between. The
 * per-tab buttons appear on hover and take no room until they show. Keyboard: arrows move, Home/End
 * jump.
 */
@Component({
  selector: 'nc-tabs',
  imports: [IconComponent, CdkDrag, CdkDropList],
  templateUrl: './tabs.component.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TabsComponent<T extends string = string> {
  readonly tabs = input.required<readonly TabItem<T>[]>();
  readonly value = model<T>();
  readonly label = input<string>();
  readonly variant = input<TabsVariant>('panel');
  /** Whether a tab offers a pencil. The double-click stands whether or not it does. */
  readonly editable = input(false, { transform: booleanAttribute });
  /** Whether a tab offers a trash. Never on the last one: a list of none is nothing to choose from. */
  readonly removable = input(false, { transform: booleanAttribute });
  /** Dragging a tab means something only where the order does; off, the tabs sit still. */
  readonly reorderable = input(false, { transform: booleanAttribute });
  readonly editLabel = input('Rename');
  readonly removeLabel = input('Remove');
  readonly backLabel = input('Earlier tabs');
  readonly onLabel = input('Later tabs');

  /** Renaming or configuring a tab: a double-click, or the pencil. */
  readonly edit = output<T>();
  readonly remove = output<T>();
  /** The values in their new order, first to last. */
  readonly reorder = output<T[]>();

  private readonly tabEls = viewChildren<ElementRef<HTMLElement>>('tab');
  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');

  protected readonly frameClass = computed(() => VARIANT[this.variant()].frame);
  protected readonly listClass = computed(() => VARIANT[this.variant()].list);
  protected readonly itemClass = computed(() => VARIANT[this.variant()].item);
  protected readonly labelClass = computed(() => VARIANT[this.variant()].label);
  protected readonly iconSize = computed(() => VARIANT[this.variant()].icon);
  /** How far the run of tabs is scrolled, and how far it could be. Measured, not derived. */
  private readonly scrolled = signal(0);
  private readonly overflow = signal(0);
  protected readonly canScrollBack = computed(() => this.scrolled() > 1);
  protected readonly canScrollOn = computed(() => this.scrolled() < this.overflow() - 1);

  constructor() {
    // A tab chosen from somewhere else — a keyboard shortcut, a freshly added one — may be off the
    // end of a strip that scrolls.
    effect(() => {
      const at = this.tabs().findIndex((tab) => tab.value === this.value());
      const el = this.tabEls()[at]?.nativeElement;
      const box = this.scroller()?.nativeElement;
      if (!el || !box) {
        return;
      }
      const tabRect = el.getBoundingClientRect();
      const boxRect = box.getBoundingClientRect();
      if (tabRect.left < boxRect.left) {
        box.scrollLeft -= boxRect.left - tabRect.left;
      } else if (tabRect.right > boxRect.right) {
        box.scrollLeft += tabRect.right - boxRect.right;
      }
    });
    // Measured after the render that draws the tabs: before it, the scroller still reports the
    // previous layout.
    afterRenderEffect(() => {
      this.tabs();
      this.variant();
      this.measure();
    });
    effect((onCleanup) => {
      const box = this.scroller()?.nativeElement;
      if (!box || typeof ResizeObserver === 'undefined') {
        return;
      }
      const watch = new ResizeObserver(() => {
        this.measure();
      });
      watch.observe(box);
      onCleanup(() => {
        watch.disconnect();
      });
    });
  }

  protected measure(): void {
    const box = this.scroller()?.nativeElement;
    if (!box) {
      return;
    }
    this.scrolled.set(box.scrollLeft);
    this.overflow.set(box.scrollWidth - box.clientWidth);
  }

  /** A screenful at a time, which is the move somebody clicking an arrow is asking for. */
  protected page(direction: number): void {
    const box = this.scroller()?.nativeElement;
    box?.scrollBy?.({ left: direction * box.clientWidth, behavior: 'smooth' });
  }

  /**
   * What a tab is called, out loud: its number where it carries no name, because a tab announced as
   * nothing is one nobody using a screen reader can choose.
   */
  protected nameOf(tab: TabItem<T>): string {
    if (tab.label) {
      return tab.label;
    }

    return tab.index === undefined ? '' : String(tab.index);
  }

  /** A tab's own button, without also choosing the tab it sits on. */
  protected act(out: { emit: (value: T) => void }, value: T, event: Event): void {
    event.stopPropagation();
    out.emit(value);
  }

  protected dropped(event: CdkDragDrop<unknown>): void {
    const order = this.tabs().map((tab) => tab.value);
    moveItemInArray(order, event.previousIndex, event.currentIndex);
    this.reorder.emit(order);
  }

  protected onKey(event: KeyboardEvent): void {
    if (event.target !== event.currentTarget) {
      return;
    }
    const list = this.tabs();
    if (event.key === 'Enter' || event.key === ' ') {
      const here = list[Number((event.currentTarget as HTMLElement).dataset.index)];
      if (here) {
        event.preventDefault();
        this.value.set(here.value);
      }
      return;
    }
    const i = list.findIndex((tab) => tab.value === this.value());
    let next: number;
    switch (event.key) {
      case 'ArrowRight':
        next = (i + 1) % list.length;
        break;
      case 'ArrowLeft':
        next = (i - 1 + list.length) % list.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = list.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    const tab = list[next];
    if (!tab) {
      return;
    }
    this.value.set(tab.value);
    this.tabEls()[next]?.nativeElement.focus();
  }
}
