import { computed, DestroyRef, effect, inject, Injectable, signal, untracked } from '@angular/core';

import { AuthStore } from '../auth/auth.store';
import { FeaturesService } from '../config/features.service';
import { AnalyticsApi } from './analytics.api';
import { ANALYTICS_CHANNEL, ConsentStore } from './consent.store';
import { ensureVisitorId, rotateVisitor } from './visitor';

type ChannelMessage =
  | { type: 'account-changed'; userId: number | null }
  | { type: 'erased' }
  | { type: 'consent-changed' };

/**
 * Keeps this browser's visitor id on the right account. The visitor cookie is shared by every tab,
 * and belongs to the account holding the shared refresh cookie: whoever last signed in or out in
 * this browser. Only the tab that does so rotates and links the visitor, and a link never takes a
 * visitor another account holds, so tabs cannot undo each other. A tab still signed in as another
 * account is suspended, reporting nothing under the visitor, until its own refresh catches up.
 */
@Injectable({ providedIn: 'root' })
export class BrowserAccountService {
  private readonly auth = inject(AuthStore);
  private readonly consent = inject(ConsentStore);
  private readonly features = inject(FeaturesService);
  private readonly api = inject(AnalyticsApi);

  /** The browser's account as the last tab to sign in or out said; undefined until one has. */
  private readonly browserAccount = signal<number | null | undefined>(undefined);
  private channel: BroadcastChannel | null = null;
  private previousUserId: number | null | undefined = undefined;
  private linked: string | null = null;

  /** Whether this tab is signed in as an account other than the browser's. */
  readonly suspended = computed(() => {
    const own = this.auth.userId();
    const browser = this.browserAccount();
    return own !== null && browser !== undefined && browser !== own;
  });

  constructor() {
    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel(ANALYTICS_CHANNEL);
      this.channel.onmessage = (event: MessageEvent<ChannelMessage>): void => {
        this.receive(event.data);
      };
    }
    inject(DestroyRef).onDestroy(() => {
      this.channel?.close();
    });

    effect(() => {
      if (this.auth.status() === 'booting') {
        return;
      }
      const userId = this.auth.userId();
      untracked(() => {
        this.accountChanged(this.previousUserId, userId);
      });
      this.previousUserId = userId;
    });

    effect(() => {
      const ready =
        this.features.analytics() &&
        this.consent.status() === 'granted' &&
        this.auth.userId() !== null &&
        !this.suspended();
      if (ready) {
        untracked(() => void this.linkVisitor());
      }
    });
  }

  /** After this tab erased the account's analytics: start a fresh visitor everywhere. */
  async afterErase(): Promise<void> {
    rotateVisitor();
    this.linked = null;
    this.channel?.postMessage({ type: 'erased' } satisfies ChannelMessage);
    await this.linkVisitor();
  }

  private accountChanged(previous: number | null | undefined, current: number | null): void {
    if (previous === current) {
      return;
    }
    if (current !== null) {
      // Signed in here, at boot or by hand: this tab now speaks for the browser.
      this.claimBrowser(current);
      return;
    }
    if (previous !== undefined && previous !== null && !this.auth.sessionExpired()) {
      // Signed out here: the next person on this browser starts as a new visitor.
      if (this.consent.status() === 'granted') {
        rotateVisitor();
      }
      this.linked = null;
      this.claimBrowser(null);
    }
    // Cleared because the browser now belongs to another account: that tab speaks for it.
  }

  private claimBrowser(userId: number | null): void {
    this.browserAccount.set(userId);
    this.channel?.postMessage({ type: 'account-changed', userId } satisfies ChannelMessage);
  }

  private receive(message: ChannelMessage): void {
    if (message.type === 'account-changed') {
      this.browserAccount.set(message.userId);
      this.linked = null;
      if (this.suspended()) {
        void this.auth.refresh();
      }
    } else if (message.type === 'erased') {
      this.linked = null;
    }
  }

  /** Links the current visitor, or a fresh one when the current belongs elsewhere or was erased. */
  private async linkVisitor(): Promise<void> {
    const userId = this.auth.userId();
    if (userId === null || this.consent.status() !== 'granted' || !this.features.analytics()) {
      return;
    }
    let visitorId = ensureVisitorId();
    const key = `${String(userId)}|${visitorId}`;
    if (this.linked === key) {
      return;
    }
    this.linked = key;
    let status = await this.api.link(visitorId);
    if (status === 'conflict' || status === 'erased') {
      visitorId = rotateVisitor().visitorId;
      this.linked = `${String(userId)}|${visitorId}`;
      status = await this.api.link(visitorId);
    }
    if (status !== 'linked') {
      this.linked = null;
    }
  }
}
