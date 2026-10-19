import { Dialog } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { ButtonDirective, IconComponent, PanelComponent } from '@naucto/ui';
import { filter, map, merge } from 'rxjs';

import { ConsentStore } from '../../core/analytics/consent.store';
import { AuthStore } from '../../core/auth/auth.store';
import { FeaturesService } from '../../core/config/features.service';
import { injectFeedbackPrompt, injectUpdateFeedbackPrompt } from '../queries/feedback.queries';
import { FeedbackStore } from './feedback.store';
import { FeedbackLauncher } from './feedback-launcher.service';
import { RatingFormComponent, type RatingSent } from './rating-form.component';

/** How long the thanks stays before the card goes. */
export const THANKS_MS = 3000;

/** Pages the prompt never interrupts: a game, the editor, a sign-in popup about to close. */
const BUSY = /^\/(play|edit|oauth|sign-in)(\/|$|\?)/;

/** Whether a page may show a prompt armed by a play or by an editing session. */
export function promptFits(context: 'PLAYER' | 'CREATOR', url: string): boolean {
  if (BUSY.test(url)) {
    return false;
  }
  return context === 'CREATOR' || url === '/hub' || url.startsWith('/hub?');
}

/**
 * Asks once, after a real play or editing session, how the platform is going. It waits for the
 * hub, never covers a game or a dialog, and steps aside while the consent banner asks first.
 * Closing it asks again in two weeks; an answer or "don't ask again" ends it for good.
 */
@Component({
  selector: 'nc-feedback-prompt',
  imports: [
    TranslocoDirective,
    ButtonDirective,
    IconComponent,
    PanelComponent,
    RatingFormComponent,
  ],
  templateUrl: './feedback-prompt.component.html',
  host: { '(document:keydown.escape)': 'onEscape()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FeedbackPromptComponent {
  protected readonly store = inject(FeedbackStore);
  private readonly features = inject(FeaturesService);
  private readonly auth = inject(AuthStore);
  private readonly consent = inject(ConsentStore);
  private readonly launcher = inject(FeedbackLauncher);
  private readonly prompt = injectFeedbackPrompt();
  private readonly update = injectUpdateFeedbackPrompt();
  private readonly dialog = inject(Dialog);

  protected readonly thanked = signal(false);

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

  protected readonly visible = computed(() => {
    const armed = this.store.armed();
    const url = this.url();
    if (!armed || url === null || !this.features.feedback() || !this.auth.isAuthenticated()) {
      return false;
    }
    if (this.thanked()) {
      return true;
    }
    return (
      this.prompt.data()?.eligible === true &&
      promptFits(armed.context, url) &&
      !(this.features.analytics() && this.consent.status() === 'unknown') &&
      !this.dialogOpen()
    );
  });

  protected sent(sent: RatingSent): void {
    if (sent.reportBug) {
      this.store.disarm();
      this.launcher.afterRating(sent);
      return;
    }
    this.thanked.set(true);
    setTimeout(() => {
      this.thanked.set(false);
      this.store.disarm();
    }, THANKS_MS);
  }

  protected snooze(): void {
    this.update.mutate('snooze');
    this.store.disarm();
  }

  protected decline(): void {
    this.update.mutate('decline');
    this.store.disarm();
  }

  protected onEscape(): void {
    if (this.visible() && !this.thanked()) {
      this.snooze();
    }
  }
}
