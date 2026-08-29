import { ChangeDetectionStrategy, Component, input, model, signal } from '@angular/core';

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
        <nc-chip [removable]="!disabled()" (removed)="remove(t)">{{ t }}</nc-chip>
      }
      <input
        type="text"
        [value]="draft()"
        [placeholder]="tags().length ? '' : placeholder()"
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
  readonly disabled = input(false);
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
