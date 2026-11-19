import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';

import { ButtonDirective } from './button.directive';
import { DialogShellComponent } from './dialog-shell.component';
import { InputDirective } from './input.directive';

/** Re-authenticate first: the dialog closes with what was typed, and checking it is the caller's. */
export interface PasswordFriction {
  kind: 'password';
  /** The caption over the field. */
  label: string;
}

/** The confirm button stays unavailable until the name of the thing is typed, letter for letter. */
export interface NameFriction {
  kind: 'name';
  name: string;
  /** The caption over the field, which says what to type. */
  label: string;
}

/** The confirm button is held rather than pressed; letting go early backs out. */
export interface HoldFriction {
  kind: 'hold';
  /** What the button says while it is held. */
  holdingLabel: string;
  /** How to hold it from the keyboard, said to assistive technology and on hover. */
  hint: string;
  /** How long, in milliseconds. 1200 unless said. */
  duration?: number;
}

/**
 * How much stands between the question and its answer, matched to how much there is to lose:
 * nothing for what can be recovered, a hold for what ends something live, the name for one thing
 * deleted for good, the password for the account.
 */
export type ConfirmFriction = PasswordFriction | NameFriction | HoldFriction;

export interface ConfirmDialogData {
  title: string;
  /**
   * What goes, then what that means, a paragraph each: a list, or one string with a blank line
   * between them, which is how a locale file writes it.
   */
  message: string | readonly string[];
  /** The action's name, set over the title. */
  kicker?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  friction?: ConfirmFriction;
}

const HOLD_MS = 1200;

/**
 * Yes/no dialog. Closes with `true` on confirm — or with the password, where that is the
 * friction — and with `false` on cancel.
 */
@Component({
  selector: 'nc-confirm-dialog',
  imports: [ButtonDirective, DialogShellComponent, InputDirective],
  templateUrl: './confirm-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmDialogComponent {
  protected readonly data = inject<ConfirmDialogData>(DIALOG_DATA);
  protected readonly ref = inject<DialogRef<boolean | string>>(DialogRef);
  protected readonly paragraphs =
    typeof this.data.message === 'string' ? this.data.message.split(/\n\s*\n/) : this.data.message;

  private readonly friction = this.data.friction;
  protected readonly field =
    this.friction?.kind === 'password' || this.friction?.kind === 'name' ? this.friction : null;
  protected readonly hold = this.friction?.kind === 'hold' ? this.friction : null;
  protected readonly holdMs = this.hold?.duration ?? HOLD_MS;
  /** Danger is filled in pink, and the fill of a hold is the same colour a step darker. */
  protected readonly variant = this.data.danger ? 'run' : 'primary';
  protected readonly holdFill = this.data.danger ? 'bg-hot-skirt' : 'bg-primary-skirt';

  protected readonly typed = signal('');
  protected readonly holding = signal(false);
  protected readonly locked = computed(() => {
    if (this.field?.kind === 'name') {
      return this.typed() !== this.field.name;
    }
    return this.field?.kind === 'password' && this.typed() === '';
  });
  /** Long enough to be the name and still not it: said on the field, not before. */
  protected readonly mistyped = computed(
    () =>
      this.field?.kind === 'name' &&
      this.typed().length >= this.field.name.length &&
      this.typed() !== this.field.name,
  );

  /** The hold is timed here and not by the fill's transition, which reduced motion cuts to nothing. */
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.release();
    });
  }

  protected type(event: Event): void {
    this.typed.set((event.target as HTMLInputElement).value);
  }

  protected confirm(): void {
    if (this.locked()) {
      return;
    }
    this.ref.close(this.field?.kind === 'password' ? this.typed() : true);
  }

  protected press(): void {
    if (this.timer) {
      return;
    }
    this.holding.set(true);
    this.timer = setTimeout(() => {
      this.ref.close(true);
    }, this.holdMs);
  }

  protected release(): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = null;
    this.holding.set(false);
  }

  /** Space and Enter hold the button as a pointer does; their own click would confirm at once. */
  protected holdKey(event: KeyboardEvent, down: boolean): void {
    if (event.key !== ' ' && event.key !== 'Enter') {
      return;
    }
    event.preventDefault();
    if (!down) {
      this.release();
    } else if (!event.repeat) {
      this.press();
    }
  }
}
