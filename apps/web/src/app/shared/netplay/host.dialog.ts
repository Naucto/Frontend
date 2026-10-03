import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { type NetHostOptions } from '@naucto/engine';
import {
  ButtonDirective,
  DialogShellComponent,
  FieldComponent,
  InputDirective,
  SettingRowComponent,
  ShareCodeComponent,
  ToastService,
  ToggleComponent,
} from '@naucto/ui';

import { AuthStore } from '../../core/auth/auth.store';
import type { NetUiBridgeService } from '../../core/net/net-bridge.service';
import { UserAvatarComponent } from '../user-avatar.component';

export interface HostDialogData {
  bridge: NetUiBridgeService;
  projectId: number;
  options: NetHostOptions;
}

/**
 * The game called net.host(): name the room, then hold it open.
 *
 * Two states in one dialog: once the server has minted the room, the form gives way to its join
 * code, the switch that lists it publicly, and the seats as they fill.
 */
@Component({
  selector: 'nc-host-dialog',
  imports: [
    TranslocoDirective,
    ButtonDirective,
    DialogShellComponent,
    FieldComponent,
    InputDirective,
    SettingRowComponent,
    ShareCodeComponent,
    ToggleComponent,
    UserAvatarComponent,
  ],
  templateUrl: './host.dialog.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HostDialogComponent {
  protected readonly data = inject<HostDialogData>(DIALOG_DATA);
  protected readonly ref = inject<DialogRef<boolean>>(DialogRef);
  private readonly toasts = inject(ToastService);
  private readonly transloco = inject(TranslocoService);
  private readonly auth = inject(AuthStore);

  protected readonly title = signal(this.data.options.title ?? '');
  protected readonly busy = signal(false);
  protected readonly listed = signal(false);

  /** The room exists once the server has answered; until then this dialog is still a form. */
  protected readonly open = computed(() => this.data.bridge.info() !== null);
  protected readonly code = computed(() => this.data.bridge.info()?.joinCode ?? '');

  /** Who is in, and the empty chairs after them, so a room reads as filling rather than as a count. */
  protected readonly seats = computed(() => {
    const info = this.data.bridge.info();
    const me = this.auth.user();
    const peers = this.data.bridge.peers();
    const taken = [
      { id: me?.id ?? 0, name: me?.nickname ?? me?.username ?? '' },
      ...peers.filter((id) => id !== me?.id).map((id) => ({ id, name: String(id) })),
    ];
    const max = info?.maxPlayers ?? this.data.options.maxPlayers;
    return {
      taken: taken.length,
      max,
      slots: Array.from({ length: max }, (_, i) => taken[i] ?? null),
    };
  });

  protected async start(): Promise<void> {
    if (this.busy()) {
      return;
    }
    this.busy.set(true);
    try {
      await this.data.bridge.createSession(this.data.projectId, {
        ...this.data.options,
        title: this.title().trim() || (this.data.options.title ?? 'Session'),
      });
    } catch (error: unknown) {
      this.toasts.show(
        error instanceof Error ? error.message : this.transloco.translate('net.host.failed'),
        'error',
      );
    } finally {
      this.busy.set(false);
    }
  }

  protected async setListed(listed: boolean): Promise<void> {
    const uuid = this.data.bridge.info()?.uuid;
    if (!uuid) {
      return;
    }
    this.listed.set(listed);
    try {
      this.listed.set(await this.data.bridge.setListed(uuid, listed));
    } catch {
      // Put the switch back where the server left it rather than showing a state it does not hold.
      this.listed.set(!listed);
    }
  }

  protected copy(): void {
    void navigator.clipboard.writeText(this.code());
    this.toasts.show(this.transloco.translate('net.host.copied'));
  }

  protected end(): void {
    this.data.bridge.leave();
    this.ref.close(false);
  }
}
