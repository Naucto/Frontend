import { Pipe, type PipeTransform } from '@angular/core';

import { formatRelative } from '../format';

/**
 * `{{ save.date | ncRelativeTime }}` → "2 minutes ago". Impure so the label ages with the page;
 * the cost is a string compare per change detection, which is what the templates did by hand.
 */
@Pipe({ name: 'ncRelativeTime', pure: false })
export class RelativeTimePipe implements PipeTransform {
  private lastInput: string | number | Date | null | undefined;
  private lastRendered = '';
  private renderedAt = 0;

  transform(value: Date | string | number | null | undefined): string {
    if (value === null || value === undefined) return '';
    const now = Date.now();
    // Re-derive at most once a minute per value; relative labels never change faster than that.
    if (value !== this.lastInput || now - this.renderedAt > 60_000) {
      this.lastInput = value;
      this.renderedAt = now;
      this.lastRendered = formatRelative(value, now);
    }
    return this.lastRendered;
  }
}
