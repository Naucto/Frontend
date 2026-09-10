import type { CdkDragDrop } from '@angular/cdk/drag-drop';
import { CdkDrag, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';
import type { ElementRef } from '@angular/core';
import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  model,
  output,
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

const VARIANT: Record<TabsVariant, { list: string; item: string; icon: 12 | 24 }> = {
  // Settings and other page-level strips: the UI face, inset from the edge, and the active tab
  // marked in ink. Gold is a primary action here, not a selection.
  panel: {
    list: 'border-b border-line gap-[6px] px-2.75',
    item: [
      '-mb-px flex items-center gap-1 border-b-2 border-transparent px-1.5 pt-1 pb-1.25',
      'font-ui text-meta uppercase tracking-tag text-ink-3 transition-colors hover:text-ink',
      'aria-selected:border-ink aria-selected:text-ink',
    ].join(' '),
    icon: 12,
  },
  // Sits directly on the thing it chooses between, so it carries no rule of its own: a line there
  // reads as the top of a second box rather than as the edge of this one. Gold rather than ink,
  // because here the selection *is* what everything below it is about.
  small: {
    list: 'gap-px',
    item: [
      '-mb-px flex h-2.5 min-w-0 shrink items-center gap-0.5 border-b-2 border-transparent px-1',
      // Cut rather than wrapped: the strip shares its row with whatever else the owner puts there,
      // and a name folding onto a second line pushes all of it down.
      'overflow-hidden text-ellipsis whitespace-nowrap',
      // Set like any other name, not shouted: these are things somebody typed, and a strip of
      // capitals reads as a row of headings rather than a row of names.
      'font-ui text-body tracking-copy text-ink-3 transition-colors hover:text-ink',
      'aria-selected:border-gold aria-selected:text-gold-ink',
    ].join(' '),
    icon: 12,
  },
  // A bar of its own, full height, where the tabs are the primary subject of the screen below.
  bar: {
    list: 'h-(--nc-bar-h) items-stretch border-b border-line bg-panel',
    item: [
      'flex shrink-0 items-center gap-1 border-t-2 border-r border-r-line border-t-transparent px-[15px]',
      'font-ui text-body tracking-copy text-ink-3 transition-colors hover:text-ink',
      'aria-selected:border-t-gold aria-selected:bg-paper aria-selected:text-ink',
    ].join(' '),
    icon: 24,
  },
  // The editor console: mono, full-bleed in its column, and jade — the colour the machine talks in.
  console: {
    list: 'border-b border-line',
    item: [
      '-mb-px flex h-4 items-center gap-1 border-b-2 border-transparent px-[14px]',
      'font-mono text-meta uppercase tracking-strip text-ink-3 transition-colors hover:text-ink',
      'aria-selected:border-jade aria-selected:text-jade-ink',
    ].join(' '),
    icon: 12,
  },
};

/**
 * A strip of tabs, from a page's own navigation to a picker over the thing it chooses between.
 *
 * The per-tab buttons appear on hover rather than standing there: a row that carries a pencil and a
 * trash on every tab reads as a list of controls rather than a list of names. They take no room
 * until they show -- held at zero opacity they leave a hole beside every name, which reads as a
 * tab that has lost something.
 *
 * Keyboard: arrows move, Home/End jump.
 */
@Component({
  selector: 'nc-tabs',
  imports: [IconComponent, CdkDrag, CdkDropList],
  template: `
    <div
      role="tablist"
      [attr.aria-label]="label()"
      class="flex items-center"
      [class]="listClass()"
      cdkDropList
      cdkDropListOrientation="horizontal"
      [cdkDropListDisabled]="!reorderable()"
      (cdkDropListDropped)="dropped($event)"
    >
      @for (t of tabs(); track t.value; let i = $index) {
        <div
          #tab
          cdkDrag
          [cdkDragDisabled]="!reorderable()"
          role="tab"
          [attr.aria-selected]="t.value === value()"
          [attr.aria-label]="t.label"
          [attr.tabindex]="t.value === value() ? 0 : -1"
          [attr.data-index]="i"
          class="group cursor-pointer"
          [class]="itemClass()"
          (click)="value.set(t.value)"
          (dblclick)="edit.emit(t.value)"
          (keydown)="onKey($event)"
        >
          @if (t.icon) {
            <nc-icon [name]="t.icon" [size]="iconSize()" />
          }
          @if (t.colour) {
            <span class="size-1 shrink-0 rounded-xs" [style.background]="t.colour"></span>
          }
          @if (t.index !== undefined) {
            <span class="text-ink-4">{{ t.index }}</span>
          }
          {{ t.label }}
          @if (t.badge !== undefined) {
            <span class="rounded-xs bg-raised px-0.5 text-label text-ink-2">{{ t.badge }}</span>
          }
          @if (editable()) {
            <button
              type="button"
              class="hidden shrink-0 text-ink-4 group-hover:inline-flex hover:text-ink"
              [attr.aria-label]="editLabel()"
              (click)="act(edit, t.value, $event)"
            >
              <nc-icon name="edit" [size]="iconSize()" />
            </button>
          }
          @if (removable() && tabs().length > 1) {
            <button
              type="button"
              class="hidden shrink-0 text-ink-4 group-hover:inline-flex hover:text-hot-ink"
              [attr.aria-label]="removeLabel()"
              (click)="act(remove, t.value, $event)"
            >
              <nc-icon name="trash" [size]="iconSize()" />
            </button>
          }
        </div>
      }
      <span class="flex-1"></span>
      <ng-content select="[actions]" />
    </div>
  `,
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

  /** Renaming or configuring a tab: a double-click, or the pencil. */
  readonly edit = output<T>();
  readonly remove = output<T>();
  /** The values in their new order, first to last. */
  readonly reorder = output<T[]>();

  private readonly tabEls = viewChildren<ElementRef<HTMLElement>>('tab');

  protected readonly listClass = computed(() => VARIANT[this.variant()].list);
  protected readonly itemClass = computed(() => VARIANT[this.variant()].item);
  protected readonly iconSize = computed(() => VARIANT[this.variant()].icon);

  constructor() {
    // A tab chosen from somewhere else — a keyboard shortcut, a freshly added one — may be off the
    // end of a strip that scrolls.
    effect(() => {
      const at = this.tabs().findIndex((t) => t.value === this.value());
      // Called through an optional: a test environment has no layout and does not implement it.
      this.tabEls()[at]?.nativeElement.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    });
  }

  /** A tab's own button, without also choosing the tab it sits on. */
  protected act(out: { emit: (v: T) => void }, value: T, e: Event): void {
    e.stopPropagation();
    out.emit(value);
  }

  protected dropped(e: CdkDragDrop<unknown>): void {
    const order = this.tabs().map((t) => t.value);
    moveItemInArray(order, e.previousIndex, e.currentIndex);
    this.reorder.emit(order);
  }

  protected onKey(e: KeyboardEvent): void {
    const list = this.tabs();
    if (e.key === 'Enter' || e.key === ' ') {
      const here = list[Number((e.currentTarget as HTMLElement).dataset.index)];
      if (here) {
        e.preventDefault();
        this.value.set(here.value);
      }
      return;
    }
    const i = list.findIndex((t) => t.value === this.value());
    let next = i;
    if (e.key === 'ArrowRight') next = (i + 1) % list.length;
    else if (e.key === 'ArrowLeft') next = (i - 1 + list.length) % list.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = list.length - 1;
    else return;
    e.preventDefault();
    const tab = list[next];
    if (!tab) return;
    this.value.set(tab.value);
    this.tabEls()[next]?.nativeElement.focus();
  }
}
