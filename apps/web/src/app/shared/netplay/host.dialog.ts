import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  linkedSignal,
  signal,
} from '@angular/core';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { multiplayerControllerPlayers } from '@naucto/api-client';
import { type NetHostOptions } from '@naucto/engine';
import {
  ButtonDirective,
  DialogShellComponent,
  FieldComponent,
  InputDirective,
  SettingRowComponent,
  ShareCodeComponent,
  StatComponent,
  ToastService,
  ToggleComponent,
} from '@naucto/ui';
import { injectQuery, keepPreviousData } from '@tanstack/angular-query-experimental';

import { unwrap } from '../../core/api/api-errors';
import { AuthStore } from '../../core/auth/auth.store';
import type { NetUiBridgeService } from '../../core/net/net-bridge.service';
import { qk } from '../queries/query-keys';
import { UserAvatarComponent } from '../user-avatar.component';

export interface HostDialogData {
  bridge: NetUiBridgeService;
  projectId: string;
  options: NetHostOptions;
  /** The editor hosting to test its own game, which is not a real game played. */
  editorTest?: boolean;
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
    StatComponent,
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
  /** What the room is, shown as asked for while the server answers. */
  protected readonly listed = linkedSignal(() => this.data.bridge.info()?.listed ?? false);

  /** The room exists once the server has answered; until then this dialog is still a form. */
  protected readonly open = computed(() => this.data.bridge.info() !== null);
  protected readonly code = computed(() => this.data.bridge.info()?.joinCode ?? '');

  /**
   * The accounts of the session, each with the number it plays under. A seat is taken on the
   * server before its player reaches the table, so the roster is asked again whenever the table
   * changes and then holds whoever just sat down.
   */
  private readonly roster = injectQuery(() => {
    const uuid = this.data.bridge.info()?.uuid ?? null;
    const table = this.data.bridge.peers();
    return {
      queryKey: qk.sessionPlayers(uuid, table),
      queryFn: async () =>
        unwrap(await multiplayerControllerPlayers({ path: { sessionId: uuid ?? '' } })).players,
      enabled: uuid !== null && table.length > 0,
      placeholderData: keepPreviousData,
    };
  });

  /** Who is in, and the empty chairs after them, so a room reads as filling rather than as a count. */
  protected readonly seats = computed(() => {
    const info = this.data.bridge.info();
    const me = this.auth.user();
    const self = this.data.bridge.session()?.selfPlayer;
    const roster = this.roster.data() ?? [];
    // A player is placed by the number the roster gives an account, never by an account's id. One
    // the roster does not hold, such as the second client of an editor's test, keeps its number.
    const taken: { account: string | null; name: string }[] = [
      { account: me?.id ?? null, name: me?.nickname ?? me?.username ?? '' },
      ...this.data.bridge
        .peers()
        .filter((player) => player !== self)
        .map((player) => {
          const seated = roster.find((entry) => entry.playerId === player);
          return seated
            ? { account: seated.userId, name: seated.nickname ?? seated.username }
            : {
                account: null,
                name: this.transloco.translate('net.unknownPlayer', { number: player }),
              };
        }),
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
      await this.data.bridge.createSession(
        this.data.projectId,
        {
          ...this.data.options,
          title: this.title().trim() || (this.data.options.title ?? 'Session'),
        },
        this.data.editorTest === true,
      );
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
      await this.data.bridge.setListed(uuid, listed);
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
