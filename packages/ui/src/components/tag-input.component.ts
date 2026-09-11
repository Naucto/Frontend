import { ChangeDetectionStrategy, Component, computed, input, model, signal } from '@angular/core';

import { ChipComponent } from './chip.component';

/** Tags as removable chips + an inline input. Enter or comma adds; Backspace on empty removes the last. */
@Component({
  selector: 'nc-tag-input',
  imports: [ChipComponent],
  template: `
    <div
      class="flex min-h-5 flex-wrap items-center gap-0.5 rounded-sm border border-line bg-inset px-1 py-0.5 focus-within:border-gold"
    >
      @for (t of tags(); track t) {
        <nc-chip kind="tag" [removable]="!disabled()" (removed)="remove(t)">{{ t }}</nc-chip>
      }
      <input
        type="text"
        [value]="draft()"
        [placeholder]="prompt()"
        [disabled]="disabled() || tags().length >= max()"
        [attr.aria-label]="placeholder()"
        (input)="draft.set($any($event.target).value)"
        (keydown)="onKey($event)"
        (blur)="commit()"
        class="min-w-[8ch] flex-1 bg-transparent font-ui text-ui text-ink outline-none placeholder:text-ink-4 disabled:opacity-40"
      />
    </div>
  `,
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
   * The field keeps saying it takes another one until it cannot.
   *
   * The placeholder used to be blanked as soon as the first tag landed, which left an empty input
   * with no text sitting among the chips: at two tags of ten the field read as finished, and there
   * was nothing to tell anyone the tenth was still on offer. The long sentence would crowd the
   * chips, so it shortens rather than disappears, and goes only at the ceiling — where the input is
   * disabled and the invitation would be a lie.
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
