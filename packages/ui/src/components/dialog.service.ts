import { Dialog, type DialogRef } from '@angular/cdk/dialog';
import { type ComponentType } from '@angular/cdk/portal';
import { inject, Injectable } from '@angular/core';

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
}
