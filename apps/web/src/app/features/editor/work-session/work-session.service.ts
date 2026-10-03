import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { unwrap } from '@app/core/api/api-errors';
import { AuthStore } from '@app/core/auth/auth.store';
import { AppConfigService } from '@app/core/config/app-config';
import { type GameSeed, SEED_KEY } from '@app/shared/docs/seed-new-game';
import { invalidateProjectHistory } from '@app/shared/queries/projects.queries';
import { qk } from '@app/shared/queries/query-keys';
import { TranslocoService } from '@jsverse/transloco';
import {
  projectControllerFetchProjectContent,
  projectControllerFindOne,
  projectControllerSaveCheckpoint,
  projectControllerSaveProjectContent,
  projectControllerUpdate,
  type ProjectExResponseDto,
  workSessionControllerGetInfo,
  workSessionControllerJoin,
  workSessionControllerKick,
  workSessionControllerLeave,
} from '@naucto/api-client';
import {
  applyTutorialAssets,
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

export type SessionStatus = 'joining' | 'loading' | 'upgrading' | 'ready' | 'error' | 'closed';

export interface CanvasCursor {
  tab: string;
  /**
   * Which surface inside the tab, where a tab has more than one, so a pointer is drawn only for
   * peers looking at the same one.
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
  cursor?: CanvasCursor;
  isSelf: boolean;
}

interface AwarenessState {
  userId?: number;
  name?: string;
  cursor?: CanvasCursor;
}

const AUTOSAVE_MS = 5 * 60 * 1000;
/**
 * How long the document must sit still before it is written out: long enough that a line being
 * typed is one save, short enough that stepping away leaves nothing unsaved. The server groups
 * saves that follow each other closely, so a pause costs no extra history.
 */
const QUIET_SAVE_MS = 3000;
/** How long a guest waits for the recorded host to show up in the room before taking over. */
const HOST_PRESENCE_MS = 5000;

/**
 * One editing session on one project: joins the work session, loads and
 * migrates the game document, connects y-webrtc, tracks presence and host
 * election, and saves (the host on a timer, any collaborator on a click).
 * Provided at the editor route so all tabs share it; closing the route leaves
 * the session.
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
  /** Who the server last said hosts — what a departure is compared against. */
  private hostId: number | null = null;
  private autosave: ReturnType<typeof setInterval> | null = null;
  private quiet: ReturnType<typeof setTimeout> | null = null;
  private hostCheck: ReturnType<typeof setTimeout> | null = null;
  private kicking = false;
  private closing = false;
  /** Bumped by every local or remote change, so a save knows whether it covered the latest one. */
  private edits = 0;
  private readonly known = new Map<number, AwarenessState>();

  readonly status = signal<SessionStatus>('joining');
  readonly error = signal<string | null>(null);
  /**
   * Whether the server elected this client host: the one peer that writes the document out on the
   * timer, since every peer uploading the same state would be as many copies of it.
   */
  readonly isHost = signal(false);
  readonly project = signal<ProjectExResponseDto | null>(null);
  readonly collaborators = signal<Collaborator[]>([]);
  /** On the project, as its creator or one of its collaborators — not merely in the room. */
  readonly isCollaborator = computed(() => {
    const me = this.auth.userId();
    const p = this.project();
    return me !== null && !!p && (p.creator.id === me || p.collaborators.some((c) => c.id === me));
  });
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
   * Connected, with no save in flight and none refused. `dirty` is left out on purpose: an edit
   * reaches the peers as it is typed, and its way to the server is a separate cycle on a timer.
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
      this.edits++;
      this.dirty.set(true);
      this.saveWhenQuiet();
    };
    this.doc.on('update', onUpdate);
    const onBeforeUnload = (e: BeforeUnloadEvent): void => {
      if (this.isHost() && this.dirty()) e.preventDefault();
    };
    const onPageHide = (e: PageTransitionEvent): void => {
      if (this.isHost() && this.dirty()) void this.save({ keepalive: true });
      // A tab that is gone for good must stop being the recorded host, or no one else is elected.
      if (!e.persisted && this.projectId && this.status() === 'ready')
        void workSessionControllerLeave({ path: { id: this.projectId }, keepalive: true });
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
      if (this.closing) {
        await workSessionControllerLeave({ path: { id: projectId } }).catch(() => undefined);
        return;
      }
      const me = this.auth.userId();
      this.hostId = session.hostId;
      this.isHost.set(session.hostId === me);

      this.status.set('loading');
      const blob = unwrap(
        await projectControllerFetchProjectContent({
          path: { id: String(projectId) },
          parseAs: 'blob',
        }),
      ) as Blob | undefined;
      const saved = !!blob && blob.size > 0;
      const bytes = saved ? new Uint8Array(await blob.arrayBuffer()) : null;
      if (this.closing) return;
      if (bytes) Y.applyUpdate(this.doc, bytes, 'remote-init');

      if (isFromFutureSchema(this.doc)) throw new Error(this.i18n.translate('editor.tooNew'));
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
      } satisfies AwarenessState);
      this.provider.awareness.on(
        'change',
        (changes: { added: number[]; updated: number[]; removed: number[] }) => {
          this.onAwarenessChange(changes);
        },
      );
      this.refreshCollaborators();
      if (!this.isHost()) this.watchForAbsentHost();
      if (needsMigration(this.doc)) {
        if (this.isHost()) migrateGame(this.doc);
        else {
          this.status.set('upgrading');
          await this.waitForSchema();
          if (this.closing) return;
        }
      }
      this.game.seedDefaults();
      this.applySeedCode(saved);

      const details = unwrap(await projectControllerFindOne({ path: { id: projectId } }));
      if (this.closing) return;
      this.project.set(details);
      this.seedMeta(details);

      this.dirty.set(false);
      this.status.set('ready');
      if (this.isHost()) {
        await this.save();
        this.startAutosave();
      }
    } catch (e) {
      if (this.closing) return;
      this.error.set(e instanceof Error ? e.message : 'Could not open this game');
      this.status.set('error');
    }
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
   * Persist the document and any changed project metadata.
   *
   * One writer on the timer; anyone on a click. `force` is that click: a publish or a named
   * version has to carry the state it names, whoever pressed the button.
   */
  async save(opts: { keepalive?: boolean; force?: boolean } = {}): Promise<void> {
    if ((!this.isHost() && !opts.force) || this.status() !== 'ready') return;
    this.saving.set(true);
    try {
      const edits = this.edits;
      // The generated client resolves a refused request as a value, not a throw; a save the server
      // turned down must not go on to clear the dirty flag below.
      unwrap(
        await projectControllerSaveProjectContent({
          path: { id: this.projectId },
          body: { file: this.snapshot() },
          ...(opts.keepalive ? { keepalive: true } : {}),
        }),
      );
      const details = this.project();
      const meta = this.meta();
      // The API refuses an empty name, and the document's copy is empty while it is being retyped.
      const name = meta.name.trim() ? meta.name : (details?.name ?? '');
      if (
        details &&
        (details.name !== name ||
          (details.shortDesc ?? '') !== meta.shortDesc ||
          (details.longDesc ?? '') !== meta.longDesc ||
          JSON.stringify([...details.tags].sort()) !== JSON.stringify([...meta.tags].sort()))
      ) {
        const updated = unwrap(
          await projectControllerUpdate({
            path: { id: this.projectId },
            body: {
              name,
              shortDesc: meta.shortDesc,
              longDesc: meta.longDesc,
              tags: meta.tags,
            },
          }),
        );
        this.project.set({ ...details, ...(updated as Partial<ProjectExResponseDto>) });
        await this.invalidateProjectEverywhere();
      }
      if (this.edits === edits) this.dirty.set(false);
      else this.saveWhenQuiet();
      this.saveFailed.set(false);
      this.lastSavedAt.set(new Date());
      // Every save is a new autosave on the server, and the panel listing them would otherwise
      // hold the list as it stood when the editor opened.
      await invalidateProjectHistory(this.queries, this.projectId, 'versions');
    } catch (e) {
      this.saveFailed.set(true);
      throw e;
    } finally {
      this.saving.set(false);
    }
  }

  /** The document as the server stores it: one update, encoded for upload. */
  snapshot(): Blob {
    return new Blob([Y.encodeStateAsUpdate(this.doc) as BlobPart], {
      type: 'application/octet-stream',
    });
  }

  async saveCheckpoint(name: string): Promise<void> {
    unwrap(
      await projectControllerSaveCheckpoint({
        path: { id: String(this.projectId), name },
        body: { file: this.snapshot() },
      }),
    );
    await invalidateProjectHistory(this.queries, this.projectId, 'checkpoints');
  }

  async kick(userId: number): Promise<void> {
    await workSessionControllerKick({ path: { id: this.projectId }, body: { userId } });
  }

  async refreshProject(): Promise<void> {
    this.project.set(unwrap(await projectControllerFindOne({ path: { id: this.projectId } })));
    await this.invalidateProjectEverywhere();
  }

  async close(): Promise<void> {
    if (this.closing) return;
    this.closing = true;
    if (this.hostCheck) clearTimeout(this.hostCheck);
    this.hostCheck = null;
    if (this.autosave) clearInterval(this.autosave);
    this.autosave = null;
    if (this.quiet) clearTimeout(this.quiet);
    this.quiet = null;
    // y-webrtc allows one provider per room name per process, and the next shell on this project
    // opens that room while the save and leave below are still in flight.
    this.provider?.destroy();
    this.provider = null;
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
    this.doc.destroy();
    this.status.set('closed');
  }

  /**
   * Invalidates every query that shows this project's metadata or serves its released content: each
   * screen caches them under a key of its own, and the editor's signal is only one of the copies.
   */
  private async invalidateProjectEverywhere(): Promise<void> {
    await Promise.all([
      this.queries.invalidateQueries({ queryKey: qk.release(this.projectId) }),
      this.queries.invalidateQueries({ queryKey: qk.releaseContentUrl(this.projectId) }),
      this.queries.invalidateQueries({ queryKey: qk.releasesAll() }),
      this.queries.invalidateQueries({ queryKey: qk.projectsAll() }),
      this.queries.invalidateQueries({ queryKey: qk.profileAll() }),
    ]);
  }

  /** Code and assets a docs page left for the new game; both go in once, in one transaction. */
  private applySeedCode(saved: boolean): void {
    if (!this.isHost()) return;
    const key = `${SEED_KEY}.${String(this.projectId)}`;
    const json = sessionStorage.getItem(key);
    if (!json) return;
    sessionStorage.removeItem(key);
    const seed = JSON.parse(json) as GameSeed;
    // A seed is left for a game that has never been saved; any other game it would overwrite.
    if (saved) return;
    const entry = this.game.entryFile;
    if (!entry) return;
    this.doc.transact(() => {
      entry.text.delete(0, entry.text.length);
      entry.text.insert(0, seed.code);
      if (seed.assets) applyTutorialAssets(this.game, seed.assets);
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
      if (!value || t.toString() === value) return;
      // A host's save writes the document's fields to the server, so the two disagree at open only
      // where the server renamed the game, as it does for a fork, or refused what the document held.
      if (t.length === 0 || this.isHost()) {
        t.delete(0, t.length);
        t.insert(0, value);
      }
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

  /**
   * When peers drop, tell the server who is gone, then ask it who hosts now.
   *
   * The server elects a new host only once it knows the old one has left, and a peer that closed
   * its tab told nobody — so the ones still here kick it, and the answer that follows may name one
   * of them. Any collaborator may kick, which is what lets a room outlive its first host.
   */
  private async onPeersLeft(gone: AwarenessState[]): Promise<void> {
    if (this.kicking) return;
    this.kicking = true;
    try {
      const me = this.auth.userId();
      const host = this.hostId;
      if (host !== null && host !== me && gone.some((s) => s.userId === host))
        await this.kick(host);
      const info = unwrap(await workSessionControllerGetInfo({ path: { id: this.projectId } }));
      this.hostId = info.hostId;
      if (info.hostId === me && !this.isHost()) this.becomeHost();
      if (this.isHost()) {
        for (const s of gone)
          if (typeof s.userId === 'number' && s.userId !== me) await this.kick(s.userId);
      }
      const alone = (this.provider?.awareness.getStates().size ?? 0) === 1;
      if (alone) {
        for (const u of info.users) if (u !== me) await this.kick(u);
        if (!this.isHost()) this.becomeHost();
      }
    } catch {
      /* transient */
    } finally {
      this.kicking = false;
    }
  }

  /**
   * A recorded host that closed its tab without leaving is still the server's host, and was never in
   * this client's awareness to be seen departing.
   */
  private watchForAbsentHost(): void {
    this.hostCheck = setTimeout(() => {
      this.hostCheck = null;
      const host = this.hostId;
      if (host === null || this.isHost() || this.closing) return;
      const states = (this.provider?.awareness.getStates() ?? new Map()) as Map<
        number,
        AwarenessState
      >;
      if (![...states.values()].some((st) => st.userId === host))
        void this.onPeersLeft([{ userId: host }]);
    }, HOST_PRESENCE_MS);
  }

  private becomeHost(): void {
    this.hostId = this.auth.userId();
    this.isHost.set(true);
    if (needsMigration(this.doc)) migrateGame(this.doc);
    this.startAutosave();
  }
}
