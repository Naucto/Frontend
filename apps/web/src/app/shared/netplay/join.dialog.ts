import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import type { NetUiBridgeService } from '@app/core/net/net-bridge.service';
import { TranslocoDirective } from '@jsverse/transloco';
import { ButtonDirective, DialogShellComponent, FieldComponent, InputDirective } from '@naucto/ui';

export interface JoinDialogData {
  bridge: NetUiBridgeService;
  projectId: number;
}

interface SessionRow {
  uuid: string;
  title: string;
  host: string;
  players: number;
  max: number;
  code: boolean;
}

/** The game called net.join(): pick an open session or enter a code. */
@Component({
  selector: 'nc-join-dialog',
  imports: [
    TranslocoDirective,
    ButtonDirective,
    DialogShellComponent,
    FieldComponent,
    InputDirective,
  ],
  template: `
    <nc-dialog-shell *transloco="let t" [title]="t('net.join.title')">
      <div class="grid gap-1" role="list">
        @for (s of sessions(); track s.uuid) {
          <div
            role="listitem"
            class="flex items-center gap-2 rounded-sm border border-line bg-raised px-1.5 py-1"
          >
            <div class="min-w-0 flex-1">
              <div class="truncate text-ui text-ink">{{ s.title }}</div>
              <div class="label text-ink-3">
                {{ t('net.join.hostedBy', { name: s.host }) }} · {{ s.players }} / {{ s.max }}
              </div>
            </div>
            <button
              ncButton
              variant="run"
              size="sm"
              (click)="join(s)"
              [disabled]="busy() || s.players >= s.max"
            >
              {{ t('net.join.join') }}
            </button>
          </div>
        } @empty {
          <p class="text-body text-ink-3">
            {{ loading() ? t('net.join.loading') : t('net.join.none') }}
          </p>
        }
      </div>
      <nc-field [label]="t('net.join.code')" for="join-code" class="mt-2">
        <div class="flex gap-1">
          <input
            ncInput
            id="join-code"
            class="font-mono uppercase"
            maxlength="12"
            [value]="code()"
            (input)="code.set($any($event.target).value)"
          />
          <button
            ncButton
            variant="secondary"
            (click)="joinCode()"
            [disabled]="busy() || code().trim().length < 4"
          >
            {{ t('net.join.join') }}
          </button>
        </div>
      </nc-field>
      @if (error(); as e) {
        <p class="mt-1 text-meta text-hot-ink">{{ e }}</p>
      }
      <ng-container footer>
        <button ncButton variant="ghost" (click)="ref.close(false)">{{ t('net.cancel') }}</button>
      </ng-container>
    </nc-dialog-shell>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JoinDialogComponent {
  protected readonly data = inject<JoinDialogData>(DIALOG_DATA);
  protected readonly ref = inject<DialogRef<boolean>>(DialogRef);
  protected readonly sessions = signal<SessionRow[]>([]);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly code = signal('');

  constructor() {
    void this.data.bridge
      .listSessions(this.data.projectId)
      .then((list) => {
        this.sessions.set(list);
      })
      .catch(() => {
        this.sessions.set([]);
      })
      .finally(() => {
        this.loading.set(false);
      });
  }

  protected async join(s: SessionRow): Promise<void> {
    await this.run(() => this.data.bridge.joinSession(s.uuid));
  }

  protected async joinCode(): Promise<void> {
    await this.run(() => this.data.bridge.joinByCode(this.code().trim().toUpperCase()));
  }

  private async run(fn: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await fn();
      this.ref.close(true);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Could not join');
    } finally {
      this.busy.set(false);
    }
  }
}
