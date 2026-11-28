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

import { type MarkName } from '../icons/glyphs';
import { ChangeChipComponent, type ChangeKind } from './change-chip.component';
import { closedBy } from './disabled-scope.directive';
import { IconComponent } from './icon.component';
import { MarkComponent } from './mark.component';

export interface TabItem<T extends string> {
  value: T;
  label: string;
  badge?: string | number;
  /** Drawn before the name. */
  mark?: MarkName;
  /** Its place in the list, drawn before the name. */
  index?: number;
  /** A colour the tab is marked with, as a CSS colour. Nothing is drawn without one. */
  colour?: string;
  /** How what the tab opens differs from another version of it, drawn after the name. */
  change?: ChangeKind;
  /** Drawn struck through and faded: what it opens is gone once a change is kept. */
  struck?: boolean;
}

/** Which strip this is; the design draws them quite differently. */
export type TabsVariant = 'panel' | 'console' | 'small' | 'bar';

/**
 * A tab is a small frame open at the bottom, standing on the strip's rule. The chosen one is three
 * pixels taller each way: it rises over its neighbours and comes down through the rule, into what
 * it opens. One left idle rises a pixel under the pointer, in three held steps. Neighbours share
 * one edge, and the lit one is drawn over the other two. A strip that is disabled draws every tab
 * as the kit draws what cannot be pressed, the chosen one still the taller.
 */
const TAB =
  'flat-sm bevel-open-b relative flex shrink-0 items-center font-ui focus-visible:outline-offset-[-6px] ' +
  '-ml-[3px] first:ml-0 [transition:height_120ms_steps(3),color_180ms] ' +
  'cursor-pointer aria-disabled:cursor-not-allowed aria-disabled:bevel-edge-line aria-disabled:bevel-hi-line ' +
  'aria-disabled:bevel-fill-transparent aria-disabled:text-ink-4 aria-disabled:aria-selected:bevel-fill-line';
const OFF =
  'mb-[3px] bevel-edge-line-strong bevel-fill-panel text-ink-3 ' +
  'not-aria-disabled:hover:z-1 not-aria-disabled:hover:bevel-lit not-aria-disabled:hover:text-active-ink';
const ON = 'bevel-edge-line-strong bevel-hi-active-ink text-active-ink';

/** The rule a strip stands on, stopping a pixel short of each end as the top of a frame does. */
const RULE =
  '[background:linear-gradient(var(--nc-line-strong)_0_0)_bottom/calc(100%-6px)_3px_no-repeat]';
// One declaration, because a ground named beside it would be reset by the shorthand or not,
// depending on which of the two the stylesheet happens to write last.
const RULE_ON_PANEL =
  '[background:linear-gradient(var(--nc-line-strong)_0_0)_bottom/calc(100%-6px)_3px_no-repeat_var(--nc-panel)]';

/**
 * `frame` dresses the strip as a whole — its rule, its height, its ground — and `list` dresses the
 * run of tabs inside it, which is the part that scrolls. Anything that must stay put when the tabs
 * slide belongs to the frame. `off` and `on` are an idle and the chosen tab, `label` dresses the
 * name alone, apart from the number, the swatch and the buttons beside it. `marks` says the
 * buttons of a tab are marks, where the tab is too low to hold an icon.
 */
export const TAB_LOOKS: Record<
  TabsVariant,
  { frame: string; list: string; off: string; on: string; label: string; marks: boolean }
> = {
  // Settings and other page-level strips: caps, inset from the edge.
  panel: {
    frame: `h-(--nc-h-lg) ${RULE}`,
    list: 'pl-[6px]',
    off: `${TAB} ${OFF} h-[34px] gap-1 px-2 text-meta tracking-tag uppercase not-aria-disabled:hover:h-[37px]`,
    on: `${TAB} ${ON} bevel-fill-raised h-(--nc-h-lg) gap-1 px-2 text-meta tracking-tag uppercase`,
    label: '',
    marks: true,
  },
  // Sits directly on the thing it chooses between. Sentence case: these are names somebody typed.
  small: {
    frame: `h-[34px] ${RULE}`,
    list: '',
    off: `${TAB} ${OFF} h-[28px] gap-0.5 px-1 text-body tracking-copy not-aria-disabled:hover:h-[31px]`,
    on: `${TAB} ${ON} bevel-fill-raised h-[34px] gap-0.5 px-1 text-body tracking-copy`,
    // The cut falls on the name and never on the tab, so the number, the swatch and the buttons
    // keep their width beside a long name.
    label: 'max-w-[14ch] truncate',
    marks: true,
  },
  // A bar of its own, where the tabs are the primary subject of the screen below: the chosen one
  // opens onto the paper under it.
  bar: {
    frame: `h-(--nc-h-bar) ${RULE_ON_PANEL}`,
    list: 'pl-[6px]',
    off: `${TAB} ${OFF} h-[36px] gap-1 px-[15px] text-body tracking-copy not-aria-disabled:hover:h-[39px]`,
    on: `${TAB} ${ON} bevel-fill-paper h-[42px] gap-1 px-[15px] text-body tracking-copy`,
    label: '',
    marks: false,
  },
  // The editor console: full-bleed in its column, and jade — the colour the machine talks in.
  console: {
    frame: `h-(--nc-h-lg) ${RULE}`,
    list: '',
    off: `${TAB} ${OFF} h-[34px] gap-1 px-[14px] text-meta tracking-strip uppercase not-aria-disabled:hover:h-[37px]`,
    on:
      `${TAB} bevel-edge-line-strong bevel-hi-jade-ink bevel-fill-raised text-jade-ink ` +
      'h-(--nc-h-lg) gap-1 px-[14px] text-meta tracking-strip uppercase',
    label: '',
    marks: true,
  },
};

/**
 * A strip of tabs, from a page's own navigation to a picker over the thing it chooses between. The
 * per-tab buttons appear on hover and take no room until they show. Keyboard: arrows move, Home/End
 * jump.
 */
@Component({
  selector: 'nc-tabs',
  imports: [ChangeChipComponent, IconComponent, MarkComponent, CdkDrag, CdkDropList],
  templateUrl: './tabs.component.html',
  // Positioned, so the chosen tab is drawn over the top edge of a frame pulled up under the rule.
  host: { class: 'relative block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TabsComponent<T extends string = string> {
  readonly tabs = input.required<readonly TabItem<T>[]>();
  readonly value = model<T>();
  readonly label = input<string>();
  readonly variant = input<TabsVariant>('panel');
  readonly disabled = input(false, { transform: booleanAttribute });
  protected readonly closed = closedBy(() => this.disabled());
  /** Whether a tab is renamed or configured from the strip: by its pencil, or by a double-click. */
  readonly editable = input(false, { transform: booleanAttribute });
  /** Whether a tab offers a trash. Never on the last one: a list of none is nothing to choose from. */
  readonly removable = input(false, { transform: booleanAttribute });
  /** Dragging a tab means something only where the order does; off, the tabs sit still. */
  readonly reorderable = input(false, { transform: booleanAttribute });
  readonly editLabel = input('Rename');
  readonly removeLabel = input('Remove');
  readonly backLabel = input('Earlier tabs');
  readonly onLabel = input('Later tabs');

  /** Renaming or configuring a tab: a double-click, or the pencil. Only where {@link editable}. */
  readonly edit = output<T>();
  readonly remove = output<T>();
  /** The values in their new order, first to last. */
  readonly reorder = output<T[]>();

  private readonly tabEls = viewChildren<ElementRef<HTMLElement>>('tab');
  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');

  protected readonly look = computed(() => TAB_LOOKS[this.variant()]);

  /** The name's own look, struck and faded where what the tab opens is gone. */
  protected labelClass(tab: TabItem<T>): string {
    return tab.struck ? `${this.look().label} line-through opacity-50` : this.look().label;
  }
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

  protected choose(value: T): void {
    if (!this.closed()) {
      this.value.set(value);
    }
  }

  protected rename(value: T): void {
    if (this.editable() && !this.closed()) {
      this.edit.emit(value);
    }
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
    if (event.target !== event.currentTarget || this.closed()) {
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
