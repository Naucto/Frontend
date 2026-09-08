import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AuthStore } from '@app/core/auth/auth.store';
import type { NetUiBridgeService } from '@app/core/net/net-bridge.service';
import { TranslocoDirective } from '@jsverse/transloco';
import { type NetHostOptions } from '@naucto/engine';
import {
  AvatarComponent,
  ButtonDirective,
  DialogShellComponent,
  FieldComponent,
  InputDirective,
  SettingRowComponent,
  ShareCodeComponent,
  ToastService,
  ToggleComponent,
} from '@naucto/ui';

export interface HostDialogData {
  bridge: NetUiBridgeService;
  projectId: number;
  options: NetHostOptions;
  /** The game's name, which the opening line names so the room is recognisably of something. */
  gameName?: string;
}

/**
 * The game called net.host(): name the room, then hold it open.
 *
 * Two states in one dialog because they are one act. Starting used to close the dialog, and the
 * code the server minted was shown nowhere — the second state is where it lands, beside the
 * switch that decides whether the room is also browsable and the seats as they fill.
 */
@Component({
  selector: 'nc-host-dialog',
  imports: [
    TranslocoDirective,
    AvatarComponent,
    ButtonDirective,
    DialogShellComponent,
    FieldComponent,
    InputDirective,
    SettingRowComponent,
    ShareCodeComponent,
    ToggleComponent,
  ],
  template: `
    <nc-dialog-shell *transloco="let t" [title]="open() ? t('net.host.open') : t('net.host.title')">
      @if (!open()) {
        <p class="mb-2 text-body text-ink-2">
          @if (data.gameName) {
            {{ t('net.host.hintNamed', { game: data.gameName, n: data.options.maxPlayers }) }}
          } @else {
            {{ t('net.host.hint', { n: data.options.maxPlayers }) }}
          }
        </p>
        <nc-field [label]="t('net.host.name')" for="session-title">
          <input
            ncInput
            id="session-title"
            [value]="title()"
            maxlength="40"
            (input)="title.set($any($event.target).value)"
            (keydown.enter)="start()"
          />
        </nc-field>
      } @else {
        <nc-field [label]="t('net.host.code')">
          <nc-share-code [code]="code()" (copied)="copy()" />
          <p class="mt-1 text-meta text-ink-3">{{ t('net.host.codeHint') }}</p>
        </nc-field>
        <nc-setting-row
          class="mt-2"
          [title]="t('net.host.listed')"
          [hint]="t('net.host.listedHint')"
        >
          <nc-toggle
            [checked]="listed()"
            (checkedChange)="setListed($event)"
            [label]="t('net.host.listed')"
          />
        </nc-setting-row>
        <p class="mt-2 label text-ink-4">
          {{ t('net.host.inTheRoom', { players: seats().taken, max: seats().max }) }}
        </p>
        <div class="mt-1 flex flex-wrap gap-2">
          @for (seat of seats().slots; track $index) {
            @if (seat) {
              <nc-avatar [size]="26" [id]="seat.id" [name]="seat.name" />
            } @else {
              <span class="size-[26px] rounded-xs border border-dashed border-line-strong"></span>
            }
          }
        </div>
      }
      @if (error(); as e) {
        <p class="mt-1 text-meta text-hot-ink">{{ e }}</p>
      }
      <ng-container footer>
        @if (!open()) {
          <button ncButton variant="ghost" (click)="ref.close(false)">{{ t('net.cancel') }}</button>
          <button ncButton variant="primary" (click)="start()" [disabled]="busy()">
            {{ t('net.host.start') }}
          </button>
        } @else {
          <button ncButton variant="danger" (click)="end()">{{ t('net.host.end') }}</button>
          <button ncButton variant="primary" (click)="ref.close(true)">
            {{ t('net.host.done') }}
          </button>
        }
      </ng-container>
    </nc-dialog-shell>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HostDialogComponent {
  protected readonly data = inject<HostDialogData>(DIALOG_DATA);
  protected readonly ref = inject<DialogRef<boolean>>(DialogRef);
  private readonly toasts = inject(ToastService);
  private readonly auth = inject(AuthStore);

  protected readonly title = signal(this.data.options.title ?? '');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
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
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.data.bridge.createSession(this.data.projectId, {
        ...this.data.options,
        title: this.title().trim() || (this.data.options.title ?? 'Session'),
      });
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Could not open the session');
    } finally {
      this.busy.set(false);
    }
  }

  protected async setListed(listed: boolean): Promise<void> {
    const uuid = this.data.bridge.info()?.uuid;
    if (!uuid) return;
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
    this.toasts.show('Copied');
  }

  protected end(): void {
    this.data.bridge.leave();
    this.ref.close(false);
  }
}
