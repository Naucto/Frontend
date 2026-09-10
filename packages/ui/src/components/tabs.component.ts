import { ChangeDetectionStrategy, Component, computed, input, model, output } from '@angular/core';

import { type IconName } from '../icons/paths';
import { IconComponent } from './icon.component';

export interface TabItem<T extends string> {
  value: T;
  label: string;
  badge?: string | number;
  icon?: IconName;
  /** Its place in the list, drawn before the name the way a code tab draws one. */
  index?: number;
  /** A colour the tab is marked with, as a CSS colour. Nothing is drawn without one. */
  colour?: string;
}

/** Which strip this is; the design draws them quite differently. */
export type TabsVariant = 'panel' | 'console' | 'small';

const VARIANT: Record<TabsVariant, { list: string; item: string }> = {
  // Settings and other page-level strips: the UI face, inset from the edge, and the active tab
  // marked in ink. Gold is a primary action here, not a selection.
  panel: {
    list: 'border-b border-line gap-[6px] px-2.75',
    item: [
      '-mb-px flex items-center gap-1 border-b-2 border-transparent px-1.5 pt-1 pb-1.25',
      'font-ui text-meta uppercase tracking-tag text-ink-3 transition-colors hover:text-ink',
      'aria-selected:border-ink aria-selected:text-ink',
    ].join(' '),
  },
  // Inside an inspector panel, over the thing the tabs choose between: the panel's own strip is
  // too tall to sit above a preview and still leave the preview room. Gold rather than ink,
  // because here the selection *is* what everything below is about.
  // No rule under it: the strip sits directly on the thing it chooses between, and a line there
  // would read as the top of a second box rather than as the edge of this one.
  small: {
    list: 'gap-px',
    item: [
      '-mb-px flex h-2.5 min-w-0 shrink items-center gap-0.5 border-b-2 border-transparent px-1',
      // Cut rather than wrapped: the strip shares its row with the sizes and the add button, and a
      // name folding onto a second line pushes all of them down.
      'overflow-hidden text-ellipsis whitespace-nowrap',
      'font-mono text-micro uppercase tracking-strip text-ink-4 transition-colors hover:text-ink',
      'aria-selected:border-gold aria-selected:text-gold-ink',
    ].join(' '),
  },
  // The editor console: mono, full-bleed in its column, and jade — the colour the machine talks in.
  console: {
    list: 'border-b border-line',
    item: [
      '-mb-px flex h-4 items-center gap-1 border-b-2 border-transparent px-[14px]',
      'font-mono text-meta uppercase tracking-strip text-ink-3 transition-colors hover:text-ink',
      'aria-selected:border-jade aria-selected:text-jade-ink',
    ].join(' '),
  },
};

/** Underline tabs (ACCOUNT / EDITOR / CONTROLS). Keyboard: arrows move, Home/End jump. */
@Component({
  selector: 'nc-tabs',
  imports: [IconComponent],
  template: `
    <div role="tablist" [attr.aria-label]="label()" class="flex items-center" [class]="listClass()">
      @for (t of tabs(); track t.value; let i = $index) {
        <button
          type="button"
          role="tab"
          [attr.aria-selected]="t.value === value()"
          [attr.tabindex]="t.value === value() ? 0 : -1"
          [attr.data-index]="i"
          (click)="value.set(t.value)"
          (dblclick)="edit.emit(t.value)"
          (keydown)="onKey($event)"
          [class]="itemClass()"
        >
          @if (t.icon) {
            <nc-icon [name]="t.icon" [size]="12" />
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
        </button>
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
  /** A double-click on a tab, which is how the code strip has always offered a rename. */
  readonly edit = output<T>();

  protected readonly listClass = computed(() => VARIANT[this.variant()].list);
  protected readonly itemClass = computed(() => VARIANT[this.variant()].item);

  protected onKey(e: KeyboardEvent): void {
    const list = this.tabs();
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
    const host = (e.currentTarget as HTMLElement).parentElement;
    host?.querySelector<HTMLElement>(`[data-index="${String(next)}"]`)?.focus();
  }
}
