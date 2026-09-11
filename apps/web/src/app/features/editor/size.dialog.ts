import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { ButtonDirective, DialogShellComponent, NumberFieldComponent } from '@naucto/ui';

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
  /**
   * What this size would cost, in the caller's own words: a sheet renumbers every sprite and
   * rewrites the code, a map only drops what falls outside, and neither of those is something a
   * size dialog should know.
   */
  consequences: (width: number, height: number) => SizeCost;
}

export interface SizeCost {
  /** What the change moves, one line each, or nothing where it moves nothing. */
  lines: string[];
  /**
   * What the change loses, in one line, or nothing where it loses nothing.
   *
   * Apart from the rest because it is the only one that is not reversible, and among the others
   * it read as a fourth count.
   */
  loss: string | null;
}

export interface SizeDialogResult {
  width: number;
  height: number;
}

/**
 * How big a sheet or a map is.
 *
 * Behind a dialog rather than in the strip, because of what the heavier of the two costs: a sheet's
 * size moves every sprite number in the game and rewrites the calls that named one, which is not a
 * thing to hand to a caret somebody can nudge by accident. Whatever it costs is shown while the
 * numbers are being chosen, so it is read before it happens rather than after.
 */
@Component({
  selector: 'nc-size-dialog',
  imports: [TranslocoDirective, ButtonDirective, DialogShellComponent, NumberFieldComponent],
  template: `
    <nc-dialog-shell *transloco="let t" [title]="data.title">
      <div class="flex items-center gap-1.5">
        <nc-number-field
          [label]="t('editor.size.width')"
          [value]="width()"
          [min]="data.min"
          [max]="data.max"
          [step]="data.step"
          (requested)="width.set($event)"
        />
        <nc-number-field
          [label]="t('editor.size.height')"
          [value]="height()"
          [min]="data.min"
          [max]="data.max"
          [step]="data.step"
          (requested)="height.set($event)"
        />
      </div>

      <p class="mt-1.5 text-meta text-ink-3">{{ data.note }}</p>

      @if (cost().lines.length) {
        <ul class="mt-1.5 grid gap-0.5">
          @for (line of cost().lines; track line) {
            <li class="text-meta text-orange-ink">{{ line }}</li>
          }
        </ul>
      }
      <!-- Last thing above the buttons, and on one line: it is what is read just before the one
           that goes through with it. The whole sentence is on the element, for a pointer. -->
      @if (cost().loss; as loss) {
        <p class="mt-1.5 truncate text-meta text-hot-ink" [title]="loss">{{ loss }}</p>
      }

      <ng-container footer>
        <button ncButton variant="ghost" (click)="ref.close()">
          {{ t('editor.size.cancel') }}
        </button>
        <button ncButton variant="primary" [disabled]="!changed()" (click)="submit()">
          {{ data.confirmLabel }}
        </button>
      </ng-container>
    </nc-dialog-shell>
  `,
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
    if (!this.changed()) return;
    this.ref.close({ width: this.width(), height: this.height() });
  }
}
