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
import { INSTRUMENT_NAME_MAX } from './sound-library';

export interface InstrumentDialogData {
  name: string;
  colour: number;
  /** What the slots below index into, which the instrument stores a number of rather than a colour. */
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
  templateUrl: './instrument.dialog.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InstrumentDialog {
  protected readonly data = inject<InstrumentDialogData>(DIALOG_DATA);
  protected readonly ref = inject<DialogRef<InstrumentDialogResult | undefined>>(DialogRef);
  protected readonly nameMax = INSTRUMENT_NAME_MAX;
  protected readonly slots = ACCENT_SLOTS;

  protected readonly name = signal(this.data.name);
  protected readonly colour = signal<number | null>(this.data.colour);
  protected readonly valid = computed(() => this.name().trim().length > 0);

  protected submit(): void {
    if (!this.valid()) {
      return;
    }
    this.ref.close({ name: this.name().trim(), colour: this.colour() ?? this.data.colour });
  }
}
