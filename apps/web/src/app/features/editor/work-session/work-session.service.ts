import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { unwrap } from '@app/core/api/api-errors';
import { AuthStore } from '@app/core/auth/auth.store';
import { AppConfigService } from '@app/core/config/app-config';
import { qk } from '@app/shared/queries/query-keys';
import { TranslocoService } from '@jsverse/transloco';
import {
  projectControllerFetchProjectContent,
  projectControllerFindOne,
  projectControllerSaveProjectContent,
  projectControllerUpdate,
  type ProjectExResponseDto,
  workSessionControllerGetInfo,
  workSessionControllerJoin,
  workSessionControllerKick,
  workSessionControllerLeave,
} from '@naucto/api-client';
import {
  Game,
  GAME_SCHEMA_VERSION,
  isFromFutureSchema,
  LOCAL_ORIGIN,
  migrateGame,
  needsMigration,
} from '@naucto/engine';
import type { PresenceColour } from '@naucto/ui';
import { QueryClient } from '@tanstack/angular-query-experimental';
import type { Awareness } from 'y-protocols/awareness';
import { WebrtcProvider } from 'y-webrtc';
import * as Y from 'yjs';

import { assignColours } from './presence-colours';

export type SessionStatus =
  'joining' | 'loading' | 'upgrading' | 'ready' | 'error' | 'kicked' | 'closed';

export interface CanvasCursor {
  tab: string;
  /**
   * Which surface inside the tab, where a tab has more than one.
   *
   * SOUND holds a pattern each; without this, two people on two different patterns watch each
   * other's pointer move over a roll neither of them is looking at.
   */
  scope?: string;
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
 * How long the document has to sit still before it is written out.
 *
 * The interval above covers someone who never stops; this covers everyone else, who stops all the
 * time. Three seconds is long enough that a line being typed is one save rather than twenty, and
 * short enough that stepping away from the keyboard leaves nothing unsaved behind. The server
 * groups saves that follow each other closely, so a quiet pause costs no extra history.
 */
const QUIET_SAVE_MS = 3000;

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
  private readonly queries = inject(QueryClient);
  private readonly i18n = inject(TranslocoService);
  readonly doc = new Y.Doc();
  readonly game = new Game(this.doc);

  private provider: WebrtcProvider | null = null;
  private projectId = 0;
  private autosave: ReturnType<typeof setInterval> | null = null;
  private quiet: ReturnType<typeof setTimeout> | null = null;
  private kicking = false;
  private readonly known = new Map<number, AwarenessState>();

  readonly status = signal<SessionStatus>('joining');
  readonly error = signal<string | null>(null);
  readonly isHost = signal(false);
  readonly project = signal<ProjectExResponseDto | null>(null);
  readonly collaborators = signal<Collaborator[]>([]);
  readonly dirty = signal(false);
  readonly lastSavedAt = signal<Date | null>(null);
  readonly saving = signal(false);
  /**
   * Set when the last write to the server did not land, and cleared by the next one that does.
   *
   * Autosave runs from a timer with nothing awaiting it, so a refusal has nowhere else to surface:
   * the work stays in the document and the reader would otherwise never be told.
   */
  readonly saveFailed = signal(false);
  /**
   * What the editor's status bar says, and it is about the collaboration rather than the server.
   *
   * Edits reach everyone else the moment they are typed, so nothing is pending between keystroke
   * and share. Reaching the server is a separate cycle on a timer, and how long ago that last
   * happened is reported elsewhere, on the project's own tab.
   */
  readonly synced = computed(
    () => this.status() === 'ready' && !this.saving() && !this.saveFailed(),
  );
  readonly myColour = computed<PresenceColour>(
    () => this.collaborators().find((c) => c.isSelf)?.colour ?? 'sky',
  );

  constructor() {
    const onUpdate = (_u: Uint8Array, origin: unknown): void => {
      if (origin === 'remote-init') return;
      this.dirty.set(true);
      this.saveWhenQuiet();
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

  get myUserId(): number | null {
    return this.auth.userId();
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
      const blob = content.data;
      if (blob && blob.size > 0)
        Y.applyUpdate(this.doc, new Uint8Array(await blob.arrayBuffer()), 'remote-init');

      if (isFromFutureSchema(this.doc)) throw new Error(this.i18n.translate('editor.tooNew'));
      if (needsMigration(this.doc)) {
        if (this.isHost()) migrateGame(this.doc);
        else {
          this.status.set('upgrading');
          await this.waitForSchema();
        }
      }
      this.game.seedDefaults();
      this.applySeedCode();

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
    if (
      prev?.tab === cursor?.tab &&
      prev?.scope === cursor?.scope &&
      prev?.x === cursor?.x &&
      prev?.y === cursor?.y
    )
      return;
    aw.setLocalStateField('cursor', cursor ?? undefined);
  }

  /**
   * Drop every cached copy of this project's metadata, not just the one the editor reads.
   *
   * The editor holds the project in a signal of its own, so a save that only refreshed that
   * signal left the name and the summary stale wherever else they are shown — the game page reads
   * `release`, the hub and the profile read their own lists, and none of them share a key with
   * `project`. What a mutation owns is never the whole of what it changed.
   */
  private async invalidateProjectEverywhere(): Promise<void> {
    await Promise.all([
      this.queries.invalidateQueries({ queryKey: qk.release(this.projectId) }),
      this.queries.invalidateQueries({ queryKey: qk.releasesAll() }),
      this.queries.invalidateQueries({ queryKey: ['projects'] }),
      this.queries.invalidateQueries({ queryKey: ['profile'] }),
    ]);
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
        this.project.set({ ...details, ...(updated as Partial<ProjectExResponseDto>) });
        await this.invalidateProjectEverywhere();
      }
      const bytes = Y.encodeStateAsUpdate(this.doc);
      await projectControllerSaveProjectContent({
        path: { id: this.projectId },
        body: { file: new Blob([bytes as BlobPart], { type: 'application/octet-stream' }) },
        ...(opts.keepalive ? { keepalive: true } : {}),
      });
      this.dirty.set(false);
      this.saveFailed.set(false);
      this.lastSavedAt.set(new Date());
    } catch (e) {
      this.saveFailed.set(true);
      throw e;
    } finally {
      this.saving.set(false);
    }
  }

  async kick(userId: number): Promise<void> {
    await workSessionControllerKick({ path: { id: this.projectId }, body: { userId } });
  }

  async refreshProject(): Promise<void> {
    this.project.set(unwrap(await projectControllerFindOne({ path: { id: this.projectId } })));
    await this.invalidateProjectEverywhere();
  }

  async close(): Promise<void> {
    if (this.status() === 'closed') return;
    if (this.autosave) clearInterval(this.autosave);
    this.autosave = null;
    if (this.quiet) clearTimeout(this.quiet);
    this.quiet = null;
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

  /** "Copy to new game" from the docs: the tutorial's main.lua replaces the starter code once. */
  private applySeedCode(): void {
    if (!this.isHost()) return;
    const code = sessionStorage.getItem('naucto.seed-code');
    if (!code) return;
    sessionStorage.removeItem('naucto.seed-code');
    const entry = this.game.entryFile;
    if (!entry) return;
    this.doc.transact(() => {
      entry.text.delete(0, entry.text.length);
      entry.text.insert(0, code);
    }, LOCAL_ORIGIN);
  }

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

  private seedMeta(details: ProjectExResponseDto): void {
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
      // Against the current schema, not merely against "a number": on a document one schema behind,
      // any-number is true from the start, so a peer would sail past this and start editing the old
      // shape while the host is still bringing it forward.
      const check = (): void => {
        const v = meta.get('schemaVersion');
        if (typeof v === 'number' && v >= GAME_SCHEMA_VERSION) {
          meta.unobserve(check);
          resolve();
        }
      };
      meta.observe(check);
      check();
    });
  }

  /**
   * Write the document out once the edits stop.
   *
   * Pushed back by every change, so it fires on the pause rather than during the typing. Guarded
   * by `save` itself, which is a no-op for a guest and before the session is ready.
   */
  private saveWhenQuiet(): void {
    if (this.quiet) clearTimeout(this.quiet);
    this.quiet = setTimeout(() => {
      this.quiet = null;
      // Swallowed for the same reason the interval swallows it: `save` has recorded the failure,
      // and a timer has nobody to rethrow to.
      if (this.dirty()) void this.save().catch(() => undefined);
    }, QUIET_SAVE_MS);
  }

  private startAutosave(): void {
    if (this.autosave) return;
    this.autosave = setInterval(() => {
      // Swallowed here because `save` has already recorded it; rethrowing would only reach a
      // timer, which has nobody to tell.
      if (this.dirty()) void this.save().catch(() => undefined);
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
