import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';

import { type IconName } from '../icons/paths';
import { IconComponent } from './icon.component';

export interface TabItem<T extends string> {
  value: T;
  label: string;
  badge?: string | number;
  icon?: IconName;
}

/** Which strip this is; the design draws the two quite differently. */
export type TabsVariant = 'panel' | 'console';

const VARIANT: Record<TabsVariant, { list: string; item: string }> = {
  // Settings and other page-level strips: the UI face, inset from the edge, and the active tab
  // marked in ink. Gold is a primary action here, not a selection.
  panel: {
    list: 'gap-[6px] px-2.75',
    item: [
      '-mb-px flex items-center gap-1 border-b-2 border-transparent px-1.5 pt-1 pb-1.25',
      'font-ui text-meta uppercase tracking-tag text-ink-3 transition-colors hover:text-ink',
      'aria-selected:border-ink aria-selected:text-ink',
    ].join(' '),
  },
  // The editor console: mono, full-bleed in its column, and jade — the colour the machine talks in.
  console: {
    list: '',
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
    <div
      role="tablist"
      [attr.aria-label]="label()"
      class="flex items-center border-b border-line"
      [class]="listClass()"
    >
      @for (t of tabs(); track t.value; let i = $index) {
        <button
          type="button"
          role="tab"
          [attr.aria-selected]="t.value === value()"
          [attr.tabindex]="t.value === value() ? 0 : -1"
          [attr.data-index]="i"
          (click)="value.set(t.value)"
          (keydown)="onKey($event)"
          [class]="itemClass()"
        >
          @if (t.icon) {
            <nc-icon [name]="t.icon" [size]="12" />
          }
          {{ t.label }}
          @if (t.badge !== undefined) {
            <span class="rounded-xs bg-raised px-0.5 text-[10px] text-ink-2">{{ t.badge }}</span>
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
