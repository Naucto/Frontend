import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import {
  ButtonDirective,
  DialogShellComponent,
  NoticeComponent,
  NumberFieldComponent,
} from '@naucto/ui';

export interface SizeDialogData {
  title: string;
  /** What resizing this kind of thing means, in a sentence, whatever the numbers turn out to be. */
  note: string;
  confirmLabel: string;
  width: number;
  height: number;
  min: number;
  max: number;
  step: number;
  /** What this size would cost, in the caller's own words; the dialog knows nothing of what a resize does to the thing resized. */
  consequences: (width: number, height: number) => SizeCost;
}

export interface SizeCost {
  /** What the change moves, one line each, or nothing where it moves nothing. */
  lines: string[];
  /**
   * What the change loses, in one line, or null where it loses nothing; apart from the rest because
   * it is the only part that cannot be undone.
   */
  loss: string | null;
}

export interface SizeDialogResult {
  width: number;
  height: number;
}

/** Asks for a width and a height, and shows what the caller says the change costs while the numbers are being chosen. */
@Component({
  selector: 'nc-size-dialog',
  imports: [
    TranslocoDirective,
    ButtonDirective,
    DialogShellComponent,
    NoticeComponent,
    NumberFieldComponent,
  ],
  templateUrl: './size.dialog.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SizeDialog {
  protected readonly data = inject<SizeDialogData>(DIALOG_DATA);
  protected readonly ref = inject<DialogRef<SizeDialogResult | undefined>>(DialogRef);

  protected readonly width = signal(this.data.width);
  protected readonly height = signal(this.data.height);

  protected readonly changed = computed(
    () => this.width() !== this.data.width || this.height() !== this.data.height,
  );
  protected readonly cost = computed<SizeCost>(() =>
    this.changed()
      ? this.data.consequences(this.width(), this.height())
      : { lines: [], loss: null },
  );

  protected submit(): void {
    if (!this.changed()) {
      return;
    }
    this.ref.close({ width: this.width(), height: this.height() });
  }
}
