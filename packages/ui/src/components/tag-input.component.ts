import { ChangeDetectionStrategy, Component, computed, input, model, signal } from '@angular/core';

import { ChipComponent } from './chip.component';

/** Tags as removable chips + an inline input. Enter or comma adds; Backspace on empty removes the last. */
@Component({
  selector: 'nc-tag-input',
  imports: [ChipComponent],
  templateUrl: './tag-input.component.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TagInputComponent {
  readonly tags = model<string[]>([]);
  readonly max = input(10);
  readonly placeholder = input('Type a tag and press enter');
  /** The short standing invitation, once the long one has been answered at least once. */
  readonly hint = input('+ tag');
  readonly disabled = input(false);
  /**
   * The field keeps saying it takes another one until it cannot: the invitation shortens once a tag
   * has landed and goes only at the ceiling, where the input is disabled.
   */
  protected readonly prompt = computed(() => {
    if (this.tags().length >= this.max()) return '';
    return this.tags().length ? this.hint() : this.placeholder();
  });
  protected readonly draft = signal('');

  protected onKey(e: KeyboardEvent): void {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      this.commit();
    } else if (e.key === 'Backspace' && this.draft() === '' && this.tags().length) {
      this.tags.update((t) => t.slice(0, -1));
    }
  }

  protected commit(): void {
    const v = this.draft().trim().toLowerCase();
    this.draft.set('');
    if (!v || this.tags().includes(v) || this.tags().length >= this.max()) return;
    this.tags.update((t) => [...t, v]);
  }

  protected remove(tag: string): void {
    this.tags.update((t) => t.filter((x) => x !== tag));
  }
}
