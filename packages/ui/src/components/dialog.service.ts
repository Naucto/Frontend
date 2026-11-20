import { Dialog, type DialogRef } from '@angular/cdk/dialog';
import { createGlobalPositionStrategy } from '@angular/cdk/overlay';
import { type ComponentType } from '@angular/cdk/portal';
import { inject, Injectable, Injector } from '@angular/core';

import {
  ConfirmDialogComponent,
  type ConfirmDialogData,
  type PasswordFriction,
} from './confirm-dialog.component';

/** A confirmation answered by yes or no: every friction but the password, which answers with it. */
export type ConfirmTexts = Omit<ConfirmDialogData, 'friction'> & {
  friction?: Exclude<ConfirmDialogData['friction'], PasswordFriction>;
};

/**
 * The scrim is the page seen through a half dither. Where motion is reduced, by the system or by
 * the app's own setting, it is a flat veil of the same weight instead: a field of pixels that
 * appears at once is the flicker the setting asks to be spared.
 *
 * The overlay's own stylesheet fades every backdrop in, from outside any layer, so only an
 * important utility outranks it: the steps of the dither are held, not blended.
 */
const BACKDROP = [
  'nc-dialog-backdrop',
  'opacity-100!',
  'transition-none!',
  'motion-reduce:bg-scrim/50',
  'motion-reduce:[mask-image:none]',
  'motion-reduce:[animation:none]',
  'in-data-reduce-motion:bg-scrim/50',
  'in-data-reduce-motion:[mask-image:none]',
  'in-data-reduce-motion:[animation:none]',
];

export interface DialogOptions<D> {
  data?: D;
  /** Width in px or CSS length; defaults to 480px. */
  width?: string;
  /**
   * How far under the top of the window it hangs, as a CSS length; centred when absent. For a
   * dialog whose height follows what is typed in it, which would otherwise move under the caret.
   */
  top?: string;
  ariaLabel?: string;
  /** Neither Escape nor the backdrop closes it: only what the dialog itself offers does. */
  disableClose?: boolean;
}

/** Thin wrapper over CDK Dialog with Naucto panel styling and focus management. */
@Injectable({ providedIn: 'root' })
export class DialogService {
  private readonly dialog = inject(Dialog);
  private readonly injector = inject(Injector);

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
      backdropClass: BACKDROP,
      autoFocus: 'first-tabbable',
      disableClose: opts.disableClose ?? false,
      restoreFocus: true,
      ...(opts.top && {
        positionStrategy: createGlobalPositionStrategy(this.injector)
          .centerHorizontally()
          .top(opts.top),
      }),
    });
  }

  /**
   * Asks a question and resolves `true` only on the confirm button: a dismissal by Escape or the
   * backdrop is a no. The words come already translated, since the kit has no locale of its own.
   * `friction` is what the button costs — nothing, the thing's name typed out, or a hold.
   */
  confirm(texts: ConfirmTexts): Promise<boolean> {
    const ref = this.open<ConfirmDialogComponent, ConfirmDialogData, boolean>(
      ConfirmDialogComponent,
      { data: texts },
    );
    return new Promise((resolve) => {
      ref.closed.subscribe((ok) => {
        resolve(ok === true);
      });
    });
  }

  /** The same, before something that cannot be taken back: the confirm button is marked as such. */
  confirmDanger(texts: Omit<ConfirmTexts, 'danger'>): Promise<boolean> {
    return this.confirm({ ...texts, danger: true });
  }

  /**
   * Asks for the password before something that reaches the whole account, and resolves with what
   * was typed, or `null` on a dismissal. Whether it is the right one is for the caller to find out.
   */
  confirmWithPassword(
    texts: Omit<ConfirmTexts, 'friction'>,
    passwordLabel: string,
  ): Promise<string | null> {
    const ref = this.open<ConfirmDialogComponent, ConfirmDialogData, string | boolean>(
      ConfirmDialogComponent,
      { data: { ...texts, friction: { kind: 'password', label: passwordLabel } } },
    );
    return new Promise((resolve) => {
      ref.closed.subscribe((answer) => {
        resolve(typeof answer === 'string' ? answer : null);
      });
    });
  }
}
