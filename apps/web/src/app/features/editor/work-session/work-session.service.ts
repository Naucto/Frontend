import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { unwrap } from '@app/core/api/api-errors';
import { AuthStore } from '@app/core/auth/auth.store';
import { AppConfigService } from '@app/core/config/app-config';
import {
  projectControllerFetchProjectContent,
  projectControllerFindOne,
  projectControllerSaveProjectContent,
  projectControllerUpdate,
  type ProjectResponseDto,
  workSessionControllerGetInfo,
  workSessionControllerJoin,
  workSessionControllerKick,
  workSessionControllerLeave,
} from '@naucto/api-client';
import { Game, migrateGame, needsMigration } from '@naucto/engine';
import type { PresenceColour } from '@naucto/ui';
import type { Awareness } from 'y-protocols/awareness';
import { WebrtcProvider } from 'y-webrtc';
import * as Y from 'yjs';

import { assignColours } from './presence-colours';

export type SessionStatus =
  'joining' | 'loading' | 'upgrading' | 'ready' | 'error' | 'kicked' | 'closed';

export interface CanvasCursor {
  tab: string;
  x: number;
  y: number;
}

export interface Collaborator {
  clientId: number;
  userId: number;
  name: string;
  colour: PresenceColour;
  tab?: string;
  cursor?: CanvasCursor;
  isSelf: boolean;
}

interface AwarenessState {
  userId?: number;
  name?: string;
  tab?: string;
  cursor?: CanvasCursor;
}

const AUTOSAVE_MS = 5 * 60 * 1000;

/**
 * One editing session on one project: joins the work session, loads and
 * migrates the game document, connects y-webrtc, tracks presence and host
 * election, and saves (host only). Provided at the editor route so all tabs
 * share it; closing the route leaves the session.
 */
@Injectable()
export class WorkSessionService {
  private readonly auth = inject(AuthStore);
  private readonly config = inject(AppConfigService);
  readonly doc = new Y.Doc();
  readonly game = new Game(this.doc);

  private provider: WebrtcProvider | null = null;
  private projectId = 0;
  private autosave: ReturnType<typeof setInterval> | null = null;
  private kicking = false;
  private readonly known = new Map<number, AwarenessState>();

  readonly status = signal<SessionStatus>('joining');
  readonly error = signal<string | null>(null);
  readonly isHost = signal(false);
  readonly project = signal<ProjectResponseDto | null>(null);
  readonly collaborators = signal<Collaborator[]>([]);
  readonly dirty = signal(false);
  readonly lastSavedAt = signal<Date | null>(null);
  readonly saving = signal(false);
  readonly synced = computed(() => this.status() === 'ready' && !this.dirty());
  readonly myColour = computed<PresenceColour>(
    () => this.collaborators().find((c) => c.isSelf)?.colour ?? 'sky',
  );

  constructor() {
    const onUpdate = (_u: Uint8Array, origin: unknown): void => {
      if (origin !== 'remote-init') this.dirty.set(true);
    };
    this.doc.on('update', onUpdate);
    const onBeforeUnload = (e: BeforeUnloadEvent): void => {
      if (this.isHost() && this.dirty()) e.preventDefault();
    };
    const onPageHide = (): void => {
      if (this.isHost() && this.dirty()) void this.save({ keepalive: true });
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('pagehide', onPageHide);
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('pagehide', onPageHide);
      void this.close();
    });
  }

  get id(): number {
    return this.projectId;
  }

  /** y-protocols awareness of the live session (null until connected). */
  get awareness(): Awareness | null {
    return this.provider?.awareness ?? null;
  }

  get displayName(): string {
    return this.auth.displayName();
  }

  async open(projectId: number): Promise<void> {
    this.projectId = projectId;
    try {
      const session = unwrap(await workSessionControllerJoin({ path: { id: projectId } }));
      const me = this.auth.userId();
      this.isHost.set(session.hostId === me);

      this.status.set('loading');
      const content = await projectControllerFetchProjectContent({
        path: { id: String(projectId) },
        parseAs: 'blob',
      });
      const blob = content.data as Blob | undefined;
      if (blob && blob.size > 0)
        Y.applyUpdate(this.doc, new Uint8Array(await blob.arrayBuffer()), 'remote-init');

      if (needsMigration(this.doc)) {
        if (this.isHost()) migrateGame(this.doc);
        else {
          this.status.set('upgrading');
          await this.waitForSchema();
        }
      }
      this.game.seedDefaults();

      const details = unwrap(await projectControllerFindOne({ path: { id: projectId } }));
      this.project.set(details);
      this.seedMeta(details);

      const offer = session.webrtcOffer;
      const signaling = offer.signaling.map((u) => this.config.reachable(u));
      this.provider = new WebrtcProvider(session.roomId, this.doc, {
        signaling,
        peerOpts: offer.peerOpts,
        maxConns: offer.maxConns,
      });
      this.provider.awareness.setLocalState({
        userId: me ?? undefined,
        name: this.auth.displayName(),
        tab: 'game',
      } satisfies AwarenessState);
      this.provider.awareness.on(
        'change',
        (changes: { added: number[]; updated: number[]; removed: number[] }) => {
          this.onAwarenessChange(changes);
        },
      );
      this.refreshCollaborators();

      this.dirty.set(false);
      this.status.set('ready');
      if (this.isHost()) {
        await this.save();
        this.startAutosave();
      }
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Could not open this game');
      this.status.set('error');
    }
  }

  setTab(tab: string): void {
    this.provider?.awareness.setLocalStateField('tab', tab);
  }

  /** Share where this user's pointer is on an editor canvas (null when it leaves). */
  setCursor(cursor: CanvasCursor | null): void {
    const aw = this.provider?.awareness;
    if (!aw) return;
    const prev = (aw.getLocalState() as AwarenessState | null)?.cursor;
    if (prev?.tab === cursor?.tab && prev?.x === cursor?.x && prev?.y === cursor?.y) return;
    aw.setLocalStateField('cursor', cursor ?? undefined);
  }

  /** Persist the document (host only) and any changed project metadata. */
  async save(opts: { keepalive?: boolean } = {}): Promise<void> {
    if (!this.isHost() || this.status() !== 'ready') return;
    this.saving.set(true);
    try {
      const details = this.project();
      const meta = this.meta();
      if (
        details &&
        (details.name !== meta.name ||
          (details.shortDesc ?? '') !== meta.shortDesc ||
          (details.longDesc ?? '') !== meta.longDesc ||
          JSON.stringify([...details.tags].sort()) !== JSON.stringify([...meta.tags].sort()))
      ) {
        const updated = unwrap(
          await projectControllerUpdate({
            path: { id: this.projectId },
            body: {
              name: meta.name,
              shortDesc: meta.shortDesc,
              longDesc: meta.longDesc as unknown as Record<string, unknown>,
              tags: meta.tags,
            },
          }),
        );
        this.project.set({ ...details, ...(updated as Partial<ProjectResponseDto>) });
      }
      const bytes = Y.encodeStateAsUpdate(this.doc);
      await projectControllerSaveProjectContent({
        path: { id: this.projectId },
        body: { file: new Blob([bytes as BlobPart], { type: 'application/octet-stream' }) },
        ...(opts.keepalive ? { keepalive: true } : {}),
      });
      this.dirty.set(false);
      this.lastSavedAt.set(new Date());
    } finally {
      this.saving.set(false);
    }
  }

  async kick(userId: number): Promise<void> {
    await workSessionControllerKick({ path: { id: this.projectId }, body: { userId } });
  }

  async refreshProject(): Promise<void> {
    this.project.set(unwrap(await projectControllerFindOne({ path: { id: this.projectId } })));
  }

  async close(): Promise<void> {
    if (this.status() === 'closed') return;
    if (this.autosave) clearInterval(this.autosave);
    this.autosave = null;
    try {
      if (this.isHost() && this.dirty()) await this.save();
    } catch {
      /* best effort */
    }
    try {
      if (this.projectId) await workSessionControllerLeave({ path: { id: this.projectId } });
    } catch {
      /* session may already be gone */
    }
    this.provider?.destroy();
    this.provider = null;
    this.doc.destroy();
    this.status.set('closed');
  }

  // ---- internals ------------------------------------------------------------

  private meta(): { name: string; shortDesc: string; longDesc: string; tags: string[] } {
    const d = this.doc;
    const tagsRaw = d.getText('projectTags').toString();
    let tags: string[] = [];
    try {
      const parsed = JSON.parse(tagsRaw || '[]') as unknown;
      if (Array.isArray(parsed)) tags = parsed.map(String);
    } catch {
      tags = [];
    }
    return {
      name: d.getText('projectName').toString(),
      shortDesc: d.getText('shortDescription').toString(),
      longDesc: d.getText('longDescription').toString(),
      tags,
    };
  }

  private seedMeta(details: ProjectResponseDto): void {
    const set = (key: string, value: string): void => {
      const t = this.doc.getText(key);
      if (t.length === 0 && value) t.insert(0, value);
    };
    this.doc.transact(() => {
      set('projectName', details.name);
      set('shortDescription', details.shortDesc ?? '');
      set('longDescription', details.longDesc ?? '');
      set('projectTags', JSON.stringify(details.tags ?? []));
    }, 'remote-init');
  }

  private waitForSchema(): Promise<void> {
    return new Promise((resolve) => {
      const meta = this.doc.getMap('game.meta');
      const check = (): void => {
        if (typeof meta.get('schemaVersion') === 'number') {
          meta.unobserve(check);
          resolve();
        }
      };
      meta.observe(check);
      check();
    });
  }

  private startAutosave(): void {
    if (this.autosave) return;
    this.autosave = setInterval(() => {
      if (this.dirty()) void this.save();
    }, AUTOSAVE_MS);
  }

  private refreshCollaborators(): void {
    const aw = this.provider?.awareness;
    if (!aw) return;
    const states = aw.getStates() as Map<number, AwarenessState>;
    const ids = [...states.values()]
      .map((s) => s.userId)
      .filter((u): u is number => typeof u === 'number');
    const colours = assignColours(ids);
    const list: Collaborator[] = [];
    states.forEach((s, clientId) => {
      if (typeof s.userId !== 'number') return;
      this.known.set(clientId, s);
      list.push({
        clientId,
        userId: s.userId,
        name: s.name ?? `user ${String(s.userId)}`,
        colour: colours.get(s.userId) ?? 'sky',
        tab: s.tab,
        cursor: s.cursor,
        isSelf: clientId === aw.clientID,
      });
    });
    this.collaborators.set(list.sort((a, b) => a.userId - b.userId));
  }

  private onAwarenessChange(changes: {
    added: number[];
    updated: number[];
    removed: number[];
  }): void {
    const gone = changes.removed
      .map((id) => this.known.get(id))
      .filter((s): s is AwarenessState => !!s);
    for (const id of changes.removed) this.known.delete(id);
    this.refreshCollaborators();
    if (gone.length) void this.onPeersLeft(gone);
  }

  /** Port of the legacy host election: when peers drop, ask the backend who hosts now and clean up stale members. */
  private async onPeersLeft(gone: AwarenessState[]): Promise<void> {
    if (this.kicking) return;
    this.kicking = true;
    try {
      const me = this.auth.userId();
      const info = unwrap(await workSessionControllerGetInfo({ path: { id: this.projectId } }));
      if (info.hostId === me && !this.isHost()) this.becomeHost();
      if (this.isHost()) {
        for (const s of gone)
          if (typeof s.userId === 'number' && s.userId !== me) await this.kick(s.userId);
      }
      const alone = (this.provider?.awareness.getStates().size ?? 0) === 1;
      if (alone) {
        for (const u of info.users) if (Number(u) !== me) await this.kick(Number(u));
        if (!this.isHost()) this.becomeHost();
      }
    } catch {
      /* transient */
    } finally {
      this.kicking = false;
    }
  }

  private becomeHost(): void {
    this.isHost.set(true);
    if (needsMigration(this.doc)) migrateGame(this.doc);
    this.startAutosave();
  }
}
