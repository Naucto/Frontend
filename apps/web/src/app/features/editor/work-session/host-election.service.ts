import { inject, Injectable, signal } from '@angular/core';
import { workSessionControllerGetInfo, workSessionControllerKick } from '@naucto/api-client';

import { unwrap } from '../../../core/api/api-errors';
import { AuthStore } from '../../../core/auth/auth.store';
import { type AwarenessState, SessionPresenceService } from './session-presence.service';

/** How long a guest waits for the recorded host to show up in the room before taking over. */
const HOST_PRESENCE_MS = 5000;

/**
 * Which peer of the room hosts the session, as the server elected it, and the takeover when that
 * peer is gone.
 */
@Injectable()
export class HostElectionService {
  private readonly auth = inject(AuthStore);
  private readonly presence = inject(SessionPresenceService);
  private projectId = 0;
  /** Who the server last said hosts — what a departure is compared against. */
  private hostId: number | null = null;
  private hostCheck: ReturnType<typeof setTimeout> | null = null;
  private kicking = false;
  private promoted: () => void = () => undefined;

  /**
   * Whether the server elected this client host: the one peer that writes the document out on the
   * timer, since every peer uploading the same state would be as many copies of it.
   */
  readonly isHost = signal(false);

  async kick(userId: number): Promise<void> {
    await workSessionControllerKick({ path: { id: this.projectId }, body: { userId } });
  }

  private becomeHost(): void {
    this.hostId = this.auth.userId();
    this.isHost.set(true);
    this.promoted();
  }

  /**
   * When peers drop, tell the server who is gone, then ask it who hosts now.
   *
   * The server elects a new host only once it knows the old one has left, and a peer that closed
   * its tab told nobody — so the ones still here kick it, and the answer that follows may name one
   * of them. Any collaborator may kick, which is what lets a room outlive its first host.
   */
  async onPeersLeft(gone: AwarenessState[]): Promise<void> {
    if (this.kicking) {
      return;
    }
    this.kicking = true;
    try {
      const me = this.auth.userId();
      const host = this.hostId;
      if (host !== null && host !== me && gone.some((state) => state.userId === host)) {
        await this.kick(host);
      }
      const info = unwrap(await workSessionControllerGetInfo({ path: { id: this.projectId } }));
      this.hostId = info.hostId;
      if (info.hostId === me && !this.isHost()) {
        this.becomeHost();
      }
      if (this.isHost()) {
        for (const state of gone) {
          if (typeof state.userId === 'number' && state.userId !== me) {
            await this.kick(state.userId);
          }
        }
      }
      if (this.presence.peerCount() === 1) {
        for (const userId of info.users) {
          if (userId !== me) {
            await this.kick(userId);
          }
        }
        if (!this.isHost()) {
          this.becomeHost();
        }
      }
    } catch {
      /* transient */
    } finally {
      this.kicking = false;
    }
  }

  /**
   * Records the host the server named at join. `onPromoted` runs when this client takes over
   * later, after `isHost` has turned true.
   */
  start(projectId: number, hostId: number, onPromoted: () => void): void {
    this.projectId = projectId;
    this.hostId = hostId;
    this.isHost.set(hostId === this.auth.userId());
    this.promoted = onPromoted;
  }

  /**
   * A recorded host that closed its tab without leaving is still the server's host, and was never in
   * this client's awareness to be seen departing.
   */
  watchForAbsentHost(): void {
    this.hostCheck = setTimeout(() => {
      this.hostCheck = null;
      const host = this.hostId;
      if (host === null || this.isHost() || this.presence.isPresent(host)) {
        return;
      }
      void this.onPeersLeft([{ userId: host }]);
    }, HOST_PRESENCE_MS);
  }

  stop(): void {
    if (this.hostCheck) {
      clearTimeout(this.hostCheck);
    }
    this.hostCheck = null;
  }
}
