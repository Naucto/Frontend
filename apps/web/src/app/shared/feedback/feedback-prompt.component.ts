import { Dialog } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import type { ReportRole } from '@naucto/api-client';
import { DialogService } from '@naucto/ui';
import { filter, firstValueFrom, map, merge } from 'rxjs';

import { ConsentStore } from '../../core/analytics/consent.store';
import { AuthStore } from '../../core/auth/auth.store';
import { FeaturesService } from '../../core/config/features.service';
import { injectFeedbackPrompt, injectUpdateFeedbackPrompt } from '../queries/reports.queries';
import { type ArmedPrompt, FeedbackStore } from './feedback.store';
import { FeedbackLauncher } from './feedback-launcher.service';
import { FeedbackPromptDialog, type PromptOutcome } from './feedback-prompt.dialog';

/** Pages the prompt never interrupts: a game, the editor, a sign-in popup about to close. */
const BUSY = /^\/(play|edit|oauth|sign-in)(\/|$|\?)/;

/** Whether a page may show a prompt armed by a play or by an editing session. */
export function promptFits(role: ReportRole, url: string): boolean {
  if (BUSY.test(url)) {
    return false;
  }
  return role === 'CREATOR' || url === '/hub' || url.startsWith('/hub?');
}

/**
 * Opens the rating prompt once a real play or editing session has ended and the account may still
 * be asked. It waits for the hub, and for the consent banner or another dialog to be done, then
 * asks in the middle of the screen until it is answered or put off.
 */
@Component({
  selector: 'nc-feedback-prompt',
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FeedbackPromptComponent {
  private readonly store = inject(FeedbackStore);
  private readonly features = inject(FeaturesService);
  private readonly auth = inject(AuthStore);
  private readonly consent = inject(ConsentStore);
  private readonly launcher = inject(FeedbackLauncher);
  private readonly dialogs = inject(DialogService);
  private readonly dialog = inject(Dialog);
  private readonly transloco = inject(TranslocoService);
  private readonly prompt = injectFeedbackPrompt();
  private readonly update = injectUpdateFeedbackPrompt();
  private asking = false;

  private readonly url = toSignal(
    inject(Router).events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
    ),
    { initialValue: null },
  );

  private readonly dialogOpen = toSignal(
    merge(this.dialog.afterOpened, this.dialog.afterAllClosed).pipe(
      map(() => this.dialog.openDialogs.length > 0),
    ),
    { initialValue: false },
  );

  /** The prompt to ask now, or null while there is nothing to ask or no good moment to. */
  private readonly due = computed<ArmedPrompt | null>(() => {
    const armed = this.store.armed();
    const url = this.url();
    if (!armed || url === null || !this.auth.isAuthenticated()) {
      return null;
    }
    const askable =
      this.prompt.data()?.eligible === true &&
      promptFits(armed.role, url) &&
      !(this.features.analytics() && this.consent.status() === 'unknown') &&
      !this.dialogOpen();
    return askable ? armed : null;
  });

  constructor() {
    effect(() => {
      const armed = this.due();
      if (armed && !this.asking) {
        void this.ask(armed);
      }
    });
  }

  private async ask(armed: ArmedPrompt): Promise<void> {
    this.asking = true;
    const label = await firstValueFrom(
      this.transloco.selectTranslate<string>('feedback.prompt.label'),
    );
    const ref = this.dialogs.open<FeedbackPromptDialog, ArmedPrompt, PromptOutcome>(
      FeedbackPromptDialog,
      { data: armed, width: '440px', disableClose: true, ariaLabel: label },
    );
    ref.closed.subscribe((outcome) => {
      this.asking = false;
      this.store.disarm();
      if (outcome?.kind === 'sent') {
        this.launcher.afterRating();
      } else if (outcome) {
        this.update.mutate({ action: outcome.kind });
      }
    });
  }
}
