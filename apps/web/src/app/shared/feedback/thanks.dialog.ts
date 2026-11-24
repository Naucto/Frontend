import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import {
  ButtonDirective,
  DialogShellComponent,
  IconComponent,
  MarkComponent,
  NoticeComponent,
} from '@naucto/ui';

/** The community server people are invited to after sending feedback. */
export const DISCORD_INVITE = 'https://discord.gg/4fxDFCNrqW';

/** What was just sent: a rating, or a bug report and how its screenshot went. */
export type ThanksData = { kind: 'rating' } | { kind: 'bug'; screenshotRefused: boolean };

/** Thanks for a report or a rating, with an invitation to talk it over on Discord. */
@Component({
  selector: 'nc-thanks-dialog',
  imports: [
    TranslocoDirective,
    ButtonDirective,
    DialogShellComponent,
    IconComponent,
    MarkComponent,
    NoticeComponent,
  ],
  templateUrl: './thanks.dialog.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ThanksDialog {
  protected readonly ref = inject(DialogRef);
  protected readonly data = inject<ThanksData>(DIALOG_DATA);
  protected readonly discord = DISCORD_INVITE;
}
