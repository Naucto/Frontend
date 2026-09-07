import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import type { NetUiBridgeService } from '@app/core/net/net-bridge.service';
import { TranslocoDirective } from '@jsverse/transloco';
import { type NetHostOptions } from '@naucto/engine';
import { ButtonDirective, DialogShellComponent, FieldComponent, InputDirective } from '@naucto/ui';

export interface HostDialogData {
  bridge: NetUiBridgeService;
  projectId: number;
  options: NetHostOptions;
}

/** The game called net.host(): name the session and open it. */
@Component({
  selector: 'nc-host-dialog',
  imports: [
    TranslocoDirective,
    ButtonDirective,
    DialogShellComponent,
    FieldComponent,
    InputDirective,
  ],
  template: `
    <nc-dialog-shell *transloco="let t" [title]="t('net.host.title')">
      <p class="mb-2 text-body text-ink-2">
        {{ t('net.host.hint', { n: data.options.maxPlayers }) }}
      </p>
      <nc-field [label]="t('net.host.name')" for="session-title">
        <input
          ncInput
          id="session-title"
          [value]="title()"
          maxlength="40"
          (input)="title.set($any($event.target).value)"
        />
      </nc-field>
      @if (error(); as e) {
        <p class="mt-1 text-meta text-hot-ink">{{ e }}</p>
      }
      <ng-container footer>
        <button ncButton variant="ghost" (click)="ref.close(false)">{{ t('net.cancel') }}</button>
        <button ncButton variant="primary" (click)="start()" [disabled]="busy()">
          {{ t('net.host.start') }}
        </button>
      </ng-container>
    </nc-dialog-shell>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HostDialogComponent {
  protected readonly data = inject<HostDialogData>(DIALOG_DATA);
  protected readonly ref = inject<DialogRef<boolean>>(DialogRef);
  protected readonly title = signal(this.data.options.title ?? '');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async start(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.data.bridge.createSession(this.data.projectId, {
        ...this.data.options,
        title: this.title().trim() || (this.data.options.title ?? 'Session'),
      });
      this.ref.close(true);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Could not open the session');
    } finally {
      this.busy.set(false);
    }
  }
}
