import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import {
  ButtonDirective,
  DialogShellComponent,
  FieldComponent,
  InputDirective,
  SwatchPickerComponent,
} from '@naucto/ui';

import { ACCENT_SLOTS } from '../accent-slots';

export interface InstrumentDialogData {
  name: string;
  colour: number;
  /** The project's own palette, since a slot means nothing without the colours it indexes. */
  palette: readonly string[];
}

export interface InstrumentDialogResult {
  name: string;
  colour: number;
}

/** The name and colour of an instrument, which are the two things about it that are only a label. */
@Component({
  selector: 'nc-instrument-dialog',
  imports: [
    TranslocoDirective,
    ButtonDirective,
    DialogShellComponent,
    FieldComponent,
    InputDirective,
    SwatchPickerComponent,
  ],
  template: `
    <nc-dialog-shell *transloco="let t" [title]="t('editor.sound.renameInstrument')">
      <nc-field [label]="t('editor.sound.name')" for="instrument-name">
        <input
          ncInput
          id="instrument-name"
          autocomplete="off"
          spellcheck="false"
          [attr.maxlength]="nameMax"
          [value]="name()"
          (input)="name.set($any($event.target).value)"
          (keydown.enter)="submit()"
        />
      </nc-field>
      <nc-field [label]="t('editor.sound.colour')" class="mt-2">
        <nc-swatch-picker [colours]="data.palette" [slots]="slots" [(value)]="colour" />
      </nc-field>
      <ng-container footer>
        <button ncButton variant="ghost" (click)="ref.close()">
          {{ t('editor.code.cancel') }}
        </button>
        <button ncButton variant="primary" [disabled]="!valid()" (click)="submit()">
          {{ t('editor.code.rename') }}
        </button>
      </ng-container>
    </nc-dialog-shell>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InstrumentDialog {
  protected readonly data = inject<InstrumentDialogData>(DIALOG_DATA);
  protected readonly ref = inject<DialogRef<InstrumentDialogResult | undefined>>(DialogRef);
  protected readonly nameMax = 16;
  protected readonly slots = ACCENT_SLOTS;

  protected readonly name = signal(this.data.name);
  protected readonly colour = signal<number | null>(this.data.colour);
  protected readonly valid = computed(() => this.name().trim().length > 0);

  protected submit(): void {
    if (!this.valid()) return;
    this.ref.close({ name: this.name().trim(), colour: this.colour() ?? this.data.colour });
  }
}
