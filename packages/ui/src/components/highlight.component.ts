import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * A name with the part that was typed picked out.
 *
 * Only the first occurrence is marked: the point is to show why this row answered, and a word lit
 * up three times reads as decoration rather than as an explanation.
 */
@Component({
  selector: 'nc-highlight',
  template: `
    @let p = parts();
    @if (p.before) {
      <span>{{ p.before }}</span>
    }
    @if (p.hit) {
      <span class="text-gold">{{ p.hit }}</span>
    }
    @if (p.after) {
      <span>{{ p.after }}</span>
    }
  `,
  host: { class: 'contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HighlightComponent {
  readonly text = input('');
  readonly match = input('');

  protected readonly parts = computed(() => {
    const text = this.text();
    const match = this.match().trim();
    const at = match ? text.toLowerCase().indexOf(match.toLowerCase()) : -1;
    if (at < 0) return { before: text, hit: '', after: '' };
    return {
      before: text.slice(0, at),
      hit: text.slice(at, at + match.length),
      after: text.slice(at + match.length),
    };
  });
}
