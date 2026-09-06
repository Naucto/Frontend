import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import {
  ButtonDirective,
  DialogShellComponent,
  FieldComponent,
  IconComponent,
  InputDirective,
} from '@naucto/ui';

import { ACCENT_SLOTS } from '../accent-slots';

export interface CodeFileDialogData {
  title: string;
  confirmLabel: string;
  name: string;
  colour: number | null;
  /** The project's own palette, since a slot means nothing without the colours it indexes. */
  palette: readonly string[];
  /** Names already in the project, so a clash is refused here rather than made and then found. */
  taken: readonly string[];
}

export interface CodeFileDialogResult {
  name: string;
  colour: number | null;
}

/** Names a tab and gives it a colour, for a file being made or one being renamed. */
@Component({
  selector: 'nc-code-file-dialog',
  imports: [
    TranslocoDirective,
    ButtonDirective,
    DialogShellComponent,
    FieldComponent,
    IconComponent,
    InputDirective,
  ],
  template: `
    <nc-dialog-shell *transloco="let t" [title]="data.title">
      <nc-field [label]="t('editor.code.fileName')" for="file-name" [error]="error() ?? undefined">
        <input
          ncInput
          id="file-name"
          autocomplete="off"
          spellcheck="false"
          [value]="name()"
          (input)="name.set($any($event.target).value)"
          (keydown.enter)="submit()"
        />
      </nc-field>

      <p class="mt-1.5 mb-1 label text-ink-3">{{ t('editor.code.colour') }}</p>
      <div class="flex flex-wrap items-center gap-0.75">
        <button
          type="button"
          class="flex h-[22px] w-[22px] items-center justify-center border border-line-strong text-ink-4 outline-offset-2"
          [class]="colour() === null ? 'outline-2 outline-ink' : ''"
          [attr.aria-label]="t('editor.code.colourNone')"
          [attr.aria-pressed]="colour() === null"
          (click)="colour.set(null)"
        >
          <nc-icon name="close" [size]="12" />
        </button>
        @for (c of accents; track c) {
          <button
            type="button"
            class="h-[22px] w-[22px] outline-offset-2"
            [class]="colour() === c ? 'outline-2 outline-ink' : ''"
            [style.background]="data.palette[c]"
            [attr.aria-label]="t('editor.code.colourN', { n: c })"
            [attr.aria-pressed]="colour() === c"
            (click)="colour.set(c)"
          ></button>
        }
      </div>

      <ng-container footer>
        <button ncButton variant="ghost" (click)="ref.close()">
          {{ t('editor.code.cancel') }}
        </button>
        <button
          ncButton
          variant="primary"
          [disabled]="!!error() || !name().trim()"
          (click)="submit()"
        >
          {{ data.confirmLabel }}
        </button>
      </ng-container>
    </nc-dialog-shell>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CodeFileDialog {
  protected readonly data = inject<CodeFileDialogData>(DIALOG_DATA);
  protected readonly ref = inject<DialogRef<CodeFileDialogResult | undefined>>(DialogRef);
  protected readonly accents = ACCENT_SLOTS;

  protected readonly name = signal(this.data.name);
  protected readonly colour = signal<number | null>(this.data.colour);

  protected readonly error = computed(() => {
    const wanted = this.stem(this.name());
    if (!wanted) return null;
    const clash = this.data.taken.some((t) => this.stem(t) === wanted && t !== this.data.name);
    return clash ? 'A tab already goes by that name.' : null;
  });

  protected submit(): void {
    if (this.error() || !this.name().trim()) return;
    this.ref.close({ name: this.name().trim(), colour: this.colour() });
  }

  private stem(name: string): string {
    return name
      .trim()
      .replace(/\.lua$/i, '')
      .toLowerCase();
  }
}
