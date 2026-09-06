import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
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

const NAME_MAX = 24;

/** A colon separates a chunk's name from its line in a Lua message, so a name may not hold one. */
const FORBIDDEN = /[:\n\r]/;

/**
 * A file is reachable by its own name, so one named after a standard library module would be found
 * where that module is expected — by anything asking for it, including code nobody here wrote.
 */
const RESERVED = new Set([
  'coroutine',
  'debug',
  'io',
  'math',
  'os',
  'package',
  'string',
  'table',
  'utf8',
]);

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
          [attr.maxlength]="nameMax"
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
  protected readonly nameMax = NAME_MAX;
  private readonly transloco = inject(TranslocoService);

  protected readonly name = signal(this.data.name);
  protected readonly colour = signal<number | null>(this.data.colour);

  protected readonly error = computed(() => {
    const wanted = this.name().trim();
    if (!wanted) return null;
    if (wanted.length > NAME_MAX) return this.say('tooLong', { n: NAME_MAX });
    if (FORBIDDEN.test(wanted)) return this.say('badCharacter');
    if (RESERVED.has(wanted.toLowerCase())) return this.say('reserved');
    const clash = this.data.taken.some(
      (t) => t.toLowerCase() === wanted.toLowerCase() && t !== this.data.name,
    );
    return clash ? this.say('taken') : null;
  });

  protected submit(): void {
    if (this.error() || !this.name().trim()) return;
    this.ref.close({ name: this.name().trim(), colour: this.colour() });
  }

  private say(key: string, params?: Record<string, unknown>): string {
    return this.transloco.translate(`editor.code.name.${key}`, params);
  }
}
