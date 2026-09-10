import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import {
  ButtonDirective,
  DialogShellComponent,
  FieldComponent,
  InputDirective,
  SwatchPickerComponent,
} from '@naucto/ui';

import { ACCENT_SLOTS } from './accent-slots';

export interface ResourceDialogData {
  title: string;
  confirmLabel: string;
  name: string;
  colour: number | null;
  /** The project's own palette, since a slot means nothing without the colours it indexes. */
  palette: readonly string[];
  taken: readonly string[];
  /** Offered only where there is more than one left; a game needs a sheet and a map. */
  removable?: boolean;
}

export interface ResourceDialogResult {
  name: string;
  colour: number | null;
  removed?: boolean;
}

const NAME_MAX = 24;

/**
 * Names a sheet or a map and gives it a colour.
 *
 * A sheet is not reachable by name the way a code file is -- nothing looks one up -- so this asks
 * for less than the file dialog does: a name has to be its own and fit, and that is all.
 */
@Component({
  selector: 'nc-resource-dialog',
  imports: [
    TranslocoDirective,
    ButtonDirective,
    DialogShellComponent,
    FieldComponent,
    SwatchPickerComponent,
    InputDirective,
  ],
  template: `
    <nc-dialog-shell *transloco="let t" [title]="data.title">
      <nc-field
        [label]="t('editor.resource.name')"
        for="resource-name"
        [error]="error() ?? undefined"
      >
        <input
          ncInput
          id="resource-name"
          autocomplete="off"
          spellcheck="false"
          [attr.maxlength]="nameMax"
          [value]="name()"
          (input)="name.set($any($event.target).value)"
          (keydown.enter)="submit()"
        />
      </nc-field>

      <p class="mt-1.5 mb-1 label text-ink-3">{{ t('editor.resource.colour') }}</p>
      <nc-swatch-picker
        allowNone
        [colours]="data.palette"
        [slots]="accents"
        [(value)]="colour"
        [noneLabel]="t('editor.resource.colourNone')"
      />

      <ng-container footer>
        @if (data.removable) {
          <button ncButton variant="danger" (click)="remove()">
            {{ t('editor.resource.remove') }}
          </button>
        }
        <button ncButton variant="ghost" (click)="ref.close()">
          {{ t('editor.resource.cancel') }}
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
export class ResourceDialog {
  protected readonly data = inject<ResourceDialogData>(DIALOG_DATA);
  protected readonly ref = inject<DialogRef<ResourceDialogResult | undefined>>(DialogRef);
  protected readonly accents = ACCENT_SLOTS;
  protected readonly nameMax = NAME_MAX;
  private readonly transloco = inject(TranslocoService);

  protected readonly name = signal(this.data.name);
  protected readonly colour = signal<number | null>(this.data.colour);

  protected readonly error = computed(() => {
    const wanted = this.name().trim();
    if (!wanted) return null;
    if (wanted.length > NAME_MAX)
      return this.transloco.translate('editor.resource.tooLong', { n: NAME_MAX });
    const clash = this.data.taken.some(
      (t) => t.toLowerCase() === wanted.toLowerCase() && t !== this.data.name,
    );
    return clash ? this.transloco.translate('editor.resource.taken') : null;
  });

  protected submit(): void {
    if (this.error() ?? !this.name().trim()) return;
    this.ref.close({ name: this.name().trim(), colour: this.colour() });
  }

  protected remove(): void {
    this.ref.close({ name: this.data.name, colour: this.data.colour, removed: true });
  }
}
