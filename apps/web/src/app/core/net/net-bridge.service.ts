import { computed, inject, Injectable, type OnDestroy, signal } from '@angular/core';
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
} from '@naucto/api-client';
import {
  type NetHostOptions,
  type NetPermissions,
  type NetUi,
  type SessionRole,
  SharedTableSession,
  SyncedSessionTransport,
} from '@naucto/engine';

import { unwrap } from '../api/api-errors';
import { AuthStore } from '../auth/auth.store';
import { AppConfigService } from '../config/app-config';
import { PresenceStore } from '../presence/presence.store';

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

/**
 * Bridges the engine's synchronous net.host() / net.join() to the app's dialog
 * flow, and keeps the live session + its peers observable for the NET tab.
 * One per game screen.
 */
@Injectable()
export class NetUiBridgeService implements NetUi, OnDestroy {
  private readonly auth = inject(AuthStore);
  private readonly config = inject(AppConfigService);
  private readonly presence = inject(PresenceStore);
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
    const info = this.info();
    this.session()?.destroy();
    this.session.set(null);
    this.info.set(null);
    this.peers.set([]);
    this.transport = null;
    if (info?.role === 'host') this.presence.announce({ kind: 'IDLE' });
    // Tell the backend too, or the session lingers in the browse list with a phantom player in it.
    // The socket teardown already happened, so failures here are not worth surfacing.
    if (!info) return;
    const path = { sessionId: info.uuid };
    void (
      info.role === 'host'
        ? multiplayerControllerRemove({ path })
        : multiplayerControllerLeave({ path })
    ).catch(() => undefined);
  }

  /** Closing the screen (or the editor's test rig) must free the slot on the backend too. */
  ngOnDestroy(): void {
    if (this.session()) this.leave();
  }

  cancel(): void {
    const r = this.request();
    this.request.set(null);
    r?.resolve(null);
  }

  /** Test rig: delay / drop outgoing frames on this client. */
  setImpairment(latencyMs: number, loss: number): void {
    this.transport?.setImpairment({ latencyMs, loss });
  }

  // ---- REST flows (called by the dialogs) -------------------------------------

  async createSession(projectId: number, options: NetHostOptions): Promise<void> {
    const conn = unwrap(
      await multiplayerControllerCreate({
        body: {
          projectId,
          title: options.title ?? 'Session',
          maxPlayers: options.maxPlayers,
          // The backend only mints a join code for INVITE_CODE sessions, and the NET panel is built
          // around handing that code to a friend. The host's own account policy still narrows who
          // may use it (anyone / friends / code only).
          visibility: 'INVITE_CODE',
        },
      }),
    );
    this.connect(conn, 'host', { maxPlayers: options.maxPlayers, title: options.title ?? '' });
    // Hosting is what "TAKE THE SLOT" on the friends page gates on, so announce it as soon as the
    // session exists rather than waiting for a peer.
    this.presence.announce({ kind: 'HOSTING', projectId, sessionId: conn.sessionUuid });
  }

  async listSessions(
    projectId: number,
  ): Promise<
    { uuid: string; title: string; host: string; players: number; max: number; code: boolean }[]
  > {
    const res = unwrap(await multiplayerControllerList({ query: { projectId } }));
    return res.sessions.map((s) => ({
      uuid: s.sessionUuid,
      title: s.title,
      host: s.hostNickname ?? s.hostUsername,
      players: s.playerCount,
      max: s.maxPlayers,
      code: s.visibility === 'INVITE_CODE',
    }));
  }

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
      const s = unwrap(await multiplayerControllerGet({ path: { sessionId: uuid } }));
      return { maxPlayers: s.maxPlayers, title: s.title };
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
  ): void {
    const me = this.auth.userId() ?? conn.playerId;
    const signaling = conn.webrtcConfig.signaling[0];
    if (!signaling) throw new Error('session has no signaling endpoint');
    const iceServers: RTCIceServer[] = conn.webrtcConfig.peerOpts.config.iceServers.map((s) => ({
      urls: s.urls,
      username: typeof s.username === 'string' ? s.username : undefined,
      credential: typeof s.credential === 'string' ? s.credential : undefined,
    }));
    const transport = new SyncedSessionTransport({
      role,
      selfUserId: me,
      signalingUrl: this.config.reachable(signaling),
      ticket: conn.connectionTicket,
      ticketIssuedAt: Date.now(),
      iceServers,
      refreshTicket: async () => {
        try {
          const fresh = unwrap(
            await multiplayerControllerRefreshTicket({ path: { sessionId: conn.sessionUuid } }),
          );
          return { ticket: fresh.connectionTicket, issuedAt: Date.now() };
        } catch {
          return null;
        }
      },
    });
    const session = new SharedTableSession(transport, this.permissions());
    session.onPeer('joined', (id) => {
      this.peers.update((p) => (p.includes(id) ? p : [...p, id]));
    });
    session.onPeer('left', (id) => {
      this.peers.update((p) => p.filter((x) => x !== id));
    });
    session.onEnded(() => {
      this.session.set(null);
      this.info.set(null);
      this.peers.set([]);
    });
    this.transport = transport;
    this.session.set(session);
    this.info.set({
      uuid: conn.sessionUuid,
      role,
      joinCode: conn.joinCode ?? null,
      maxPlayers: meta.maxPlayers,
      title: meta.title,
    });
    const r = this.request();
    this.request.set(null);
    r?.resolve(session);
  }
}
