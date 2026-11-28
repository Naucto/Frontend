import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import {
  type AiGrantDto,
  aiGrantsControllerGrants,
  aiGrantsControllerRevoke,
} from '@naucto/api-client';
import {
  ButtonDirective,
  DialogService,
  SettingRowComponent,
  SettingsGroupComponent,
  ToastService,
} from '@naucto/ui';
import { injectQuery, QueryClient } from '@tanstack/angular-query-experimental';

import { unwrap } from '../../core/api/api-errors';

const GRANTS = ['ai-grants'] as const;

/**
 * The assistants connected to the account, each disconnected from here. An assistant connects by
 * showing a code its owner types on the connect page; nothing is copied by hand.
 */
@Component({
  selector: 'nc-assistant-settings',
  imports: [
    DatePipe,
    RouterLink,
    TranslocoDirective,
    ButtonDirective,
    SettingRowComponent,
    SettingsGroupComponent,
  ],
  templateUrl: './assistant-settings.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssistantSettingsComponent {
  private readonly qc = inject(QueryClient);
  private readonly dialogs = inject(DialogService);
  private readonly toasts = inject(ToastService);
  private readonly transloco = inject(TranslocoService);
  protected readonly grants = injectQuery(() => ({
    queryKey: GRANTS,
    queryFn: async () => unwrap(await aiGrantsControllerGrants()),
  }));

  protected async revoke(grant: AiGrantDto): Promise<void> {
    const confirmed = await this.dialogs.confirmDanger({
      title: this.transloco.translate('settings.ai.revokeTitle', { name: grant.clientName }),
      message: this.transloco.translate('settings.ai.revokeMessage'),
      confirmLabel: this.transloco.translate('settings.ai.revoke'),
    });
    if (!confirmed) {
      return;
    }
    const res = await aiGrantsControllerRevoke({ path: { grantId: grant.id } });
    if (res.error) {
      this.toasts.show(this.transloco.translate('settings.ai.revokeFailed'), 'error');
      return;
    }
    await this.qc.invalidateQueries({ queryKey: GRANTS });
  }
}
