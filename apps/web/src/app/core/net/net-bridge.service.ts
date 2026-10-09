import { computed, inject, Injectable, type OnDestroy, signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import {
  type GameSessionConnectionResponseDto,
  multiplayerControllerCreate,
  multiplayerControllerGet,
  multiplayerControllerJoin,
  multiplayerControllerJoinByCode,
  multiplayerControllerLeave,
  multiplayerControllerList,
  multiplayerControllerRefreshTicket,
  multiplayerControllerRemove,
  multiplayerControllerUpdate,
} from '@naucto/api-client';
import {
  type NetHostOptions,
  type NetPermissions,
  type NetUi,
  type RelayUsage,
  type SessionRole,
  SharedTableSession,
} from '@naucto/engine';

import { ActivityService } from '../analytics/activity.service';
import { unwrap } from '../api/api-errors';
import { AppConfigService } from '../config/app-config';
import { PresenceStore } from '../presence/presence.store';
import { SyncedSessionTransport } from './synced-session-transport';

export interface NetRequest {
  kind: 'host' | 'join';
  hostOptions?: NetHostOptions;
  resolve: (session: SharedTableSession | null) => void;
}

export interface NetSessionInfo {
  uuid: string;
  role: SessionRole;
  joinCode: string | null;
  maxPlayers: number;
  title: string;
}

/** A room someone else has open, as the join dialog lists it. */
export interface OpenSession {
  uuid: string;
  title: string;
  host: string;
  hostId: number;
  players: number;
  max: number;
  /** Reachable by code only — it is not in anyone's browse list. */
  code: boolean;
}

/**
 * Bridges the engine's synchronous net.host() / net.join() to the app's dialog
 * flow, and keeps the live session + its peers observable for the NET tab.
 * One per game screen.
 */
@Injectable()
export class NetUiBridgeService implements NetUi, OnDestroy {
  private readonly config = inject(AppConfigService);
  private readonly presence = inject(PresenceStore);
  private readonly activity = inject(ActivityService);
  private readonly transloco = inject(TranslocoService);
  private transport: SyncedSessionTransport | null = null;

  readonly request = signal<NetRequest | null>(null);
  readonly session = signal<SharedTableSession | null>(null);
  readonly info = signal<NetSessionInfo | null>(null);
  readonly peers = signal<number[]>([]);
  readonly permissions = signal<NetPermissions | undefined>(undefined);
  readonly role = computed(() => this.info()?.role ?? null);

  host(options: NetHostOptions, onReady: (session: SharedTableSession | null) => void): void {
    this.open({ kind: 'host', hostOptions: options, resolve: onReady });
  }

  join(onReady: (session: SharedTableSession | null) => void): void {
    this.open({ kind: 'join', resolve: onReady });
  }

  leave(): void {
    this.session()?.destroy();
  }

  /** Closing the screen (or the editor's test rig) must free the slot on the backend too. */
  ngOnDestroy(): void {
    if (this.session()) {
      this.leave();
    }
  }

  cancel(): void {
    const pendingRequest = this.request();
    this.request.set(null);
    pendingRequest?.resolve(null);
  }

  /** Test rig: delay / drop outgoing frames on this client. */
  setImpairment(latencyMs: number, loss: number): void {
    this.transport?.setImpairment({ latencyMs, loss });
  }

  relayUsage(): RelayUsage[] {
    return this.transport?.relayUsage() ?? [];
  }

  /** Read when a session opens, so it takes effect on the next one, not the one already running. */
  readonly relayOnly = signal(false);

  async createSession(
    projectId: number,
    options: NetHostOptions,
    editorTest = false,
  ): Promise<void> {
    // The seat count is the game's to name and the endpoint accepts 2..16, so it is narrowed here
    // rather than refused with a 400 after the dialog has already drawn that many seats.
    const maxPlayers = Math.min(16, Math.max(2, Math.trunc(options.maxPlayers)));
    const conn = unwrap(
      await multiplayerControllerCreate({
        body: {
          projectId,
          title: options.title ?? this.transloco.translate('net.host.defaultTitle'),
          maxPlayers,
          // The backend mints a join code for this visibility only, and a join code is how a host
          // invites.
          visibility: 'INVITE_CODE',
          editorTest,
        },
      }),
    );
    this.connect(
      conn,
      'host',
      { maxPlayers, title: options.title ?? '' },
      editorTest ? null : projectId,
    );
    // Announced as soon as the session exists, not on the first peer: friends can only join a
    // session their presence list shows.
    this.presence.announce({ kind: 'HOSTING', projectId });
  }

  async listSessions(projectId: number): Promise<OpenSession[]> {
    const res = unwrap(await multiplayerControllerList({ query: { projectId } }));
    return res.sessions.map((session) => ({
      uuid: session.sessionUuid,
      title: session.title,
      host: session.hostNickname ?? session.hostUsername,
      hostId: session.hostId,
      players: session.playerCount,
      max: session.maxPlayers,
      code: session.visibility === 'INVITE_CODE',
    }));
  }

  /**
   * Whether the room shows up in the browse list.
   *
   * Off is not the same as private: the code still works, so the room is reachable by whoever was
   * handed it and by nobody who was not.
   */
  async setListed(uuid: string, listed: boolean): Promise<boolean> {
    unwrap(
      await multiplayerControllerUpdate({
        path: { sessionId: uuid },
        body: { visibility: listed ? 'PUBLIC' : 'INVITE_CODE' },
      }),
    );
    // The server narrows the visibility to the host's join policy without saying so.
    const applied = unwrap(await multiplayerControllerGet({ path: { sessionId: uuid } }));
    return applied.visibility === 'PUBLIC';
  }

  /** `editorTest` takes a live seat under an id of its own, counted as a player but never persisted as a session member. */
  async joinSession(uuid: string, joinCode?: string, editorTest = false): Promise<void> {
    const conn = unwrap(
      await multiplayerControllerJoin({
        path: { sessionId: uuid },
        body: { joinCode, editorTest },
      }),
    );
    this.connect(conn, 'slave', await this.sessionInfo(uuid));
  }

  async joinByCode(joinCode: string, editorTest = false): Promise<void> {
    const conn = unwrap(await multiplayerControllerJoinByCode({ body: { joinCode, editorTest } }));
    this.connect(conn, 'slave', await this.sessionInfo(conn.sessionUuid));
  }

  /**
   * Title and slot count of a session we joined. Without it the panel reads "players 2 / —",
   * because only the host knows what it asked for.
   */
  private async sessionInfo(uuid: string): Promise<{ maxPlayers: number; title: string }> {
    try {
      const session = unwrap(await multiplayerControllerGet({ path: { sessionId: uuid } }));
      return { maxPlayers: session.maxPlayers, title: session.title };
    } catch {
      return { maxPlayers: 0, title: '' };
    }
  }

  // ---- internals -------------------------------------------------------------

  private open(request: NetRequest): void {
    if (this.request()) {
      request.resolve(null);
      return;
    }
    this.request.set(request);
  }

  private connect(
    conn: GameSessionConnectionResponseDto,
    role: SessionRole,
    meta: { maxPlayers: number; title: string },
    hostedGame: number | null = null,
  ): void {
    const signaling = conn.webrtcConfig.signaling[0];
    if (!signaling) {
      throw new Error('session has no signaling endpoint');
    }
    const iceServers: RTCIceServer[] = conn.webrtcConfig.peerOpts.config.iceServers.map(
      (server) => ({
        urls: server.urls,
        username: typeof server.username === 'string' ? server.username : undefined,
        credential: typeof server.credential === 'string' ? server.credential : undefined,
      }),
    );
    const transport = new SyncedSessionTransport({
      role,
      // The id the ticket was minted for, which is what the relay addresses every frame by. It is
      // the account id for everyone but the editor's test rig, which plays under a synthetic one.
      selfUserId: conn.playerId,
      signalingUrl: this.config.reachable(signaling),
      ticket: conn.connectionTicket,
      ticketIssuedAt: Date.now(),
      iceServers,
      relayOnly: this.relayOnly(),
      refreshTicket: async (current) => {
        try {
          const fresh = unwrap(
            await multiplayerControllerRefreshTicket({
              path: { sessionId: conn.sessionUuid },
              body: { ticket: current },
            }),
          );
          // A ticket for another id would reconnect this transport as someone else, and the room
          // would then hold two clients claiming one seat. Better to drop than to become them.
          if (fresh.playerId !== conn.playerId) {
            return null;
          }
          return { ticket: fresh.connectionTicket, issuedAt: Date.now() };
        } catch {
          return null;
        }
      },
    });
    const session = new SharedTableSession(transport, this.permissions());
    session.onPeer('joined', (id) => {
      this.peers.update((current) => (current.includes(id) ? current : [...current, id]));
    });
    session.onPeer('left', (id) => {
      this.peers.update((current) => current.filter((x) => x !== id));
    });
    const info: NetSessionInfo = {
      uuid: conn.sessionUuid,
      role,
      joinCode: conn.joinCode ?? null,
      maxPlayers: meta.maxPlayers,
      title: meta.title,
    };
    const releaseHosting =
      hostedGame === null
        ? (): void => undefined
        : this.activity.claim({ state: 'HOSTING', releaseId: hostedGame });
    const forget = (): void => {
      releaseHosting();
      this.session.set(null);
      this.info.set(null);
      this.peers.set([]);
    };
    session.onEnded(forget);
    // Closed while still ours means we walked out, whoever pulled the plug (our UI, a restart, a
    // reload): the backend frees the seat or ends the room only when told.
    session.onClosed(() => {
      if (this.session() !== session) {
        return;
      }
      forget();
      this.transport = null;
      const path = { sessionId: info.uuid };
      void (
        info.role === 'host'
          ? multiplayerControllerRemove({ path })
          : multiplayerControllerLeave({ path })
      )
        .catch(() => undefined)
        .finally(() => {
          // The server reads hosting off the room, so idle only sticks once the room is gone.
          if (info.role === 'host' && !this.info()) {
            this.presence.announce({ kind: 'IDLE' });
          }
        });
    });
    this.transport = transport;
    this.session.set(session);
    this.info.set(info);
    const pendingRequest = this.request();
    this.request.set(null);
    pendingRequest?.resolve(session);
  }
}
