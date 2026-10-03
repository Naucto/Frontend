import { Dialog, type DialogRef } from '@angular/cdk/dialog';
import { type ComponentType } from '@angular/cdk/portal';
import { inject, Injectable } from '@angular/core';

import { ConfirmDialogComponent, type ConfirmDialogData } from './confirm-dialog.component';

export interface DialogOptions<D> {
  data?: D;
  /** Width in px or CSS length; defaults to 480px. */
  width?: string;
  ariaLabel?: string;
}

/** Thin wrapper over CDK Dialog with Naucto panel styling and focus management. */
@Injectable({ providedIn: 'root' })
export class DialogService {
  private readonly dialog = inject(Dialog);

  open<T, D = unknown, R = unknown>(
    component: ComponentType<T>,
    opts: DialogOptions<D> = {},
  ): DialogRef<R, T> {
    return this.dialog.open<R, D, T>(component, {
      data: opts.data,
      width: opts.width ?? '480px',
      maxWidth: 'calc(100vw - 32px)',
      ariaLabel: opts.ariaLabel,
      panelClass: ['nc-dialog-panel'],
      backdropClass: 'nc-dialog-backdrop',
      autoFocus: 'first-tabbable',
      restoreFocus: true,
    });
  }

  /**
   * Asks before something that cannot be taken back, with the confirm button marked as such, and
   * resolves `true` only on that button: a dismissal by Escape or the backdrop is a no. The words
   * come already translated, since the kit has no locale of its own.
   */
  confirmDanger(texts: Omit<ConfirmDialogData, 'danger'>): Promise<boolean> {
    const ref = this.open<ConfirmDialogComponent, ConfirmDialogData, boolean>(
      ConfirmDialogComponent,
      { data: { ...texts, danger: true } },
    );
    return new Promise((resolve) => {
      ref.closed.subscribe((ok) => {
        resolve(ok === true);
      });
    });
  }
}
