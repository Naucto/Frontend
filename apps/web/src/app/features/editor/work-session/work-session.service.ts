import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import {
  projectContentControllerFetchProjectContent,
  projectControllerFindOne,
  type ProjectExResponseDto,
  type WebRtcOfferDto,
  workSessionControllerJoin,
  workSessionControllerLeave,
} from '@naucto/api-client';
import {
  applyTutorialAssets,
  EditableGame,
  GAME_SCHEMA_VERSION,
  isFromFutureSchema,
  KEYS,
  migrateGame,
  MIGRATION_ORIGIN,
  type MigrationWarning,
  needsMigration,
} from '@naucto/engine';
import { WebrtcProvider } from 'y-webrtc';
import * as Y from 'yjs';

import { unwrap } from '../../../core/api/api-errors';
import { AuthStore } from '../../../core/auth/auth.store';
import { AppConfigService } from '../../../core/config/app-config';
import { CrashReporter } from '../../../core/reports/crash-reporter.service';
import { type GameSeed, SEED_KEY } from '../../../shared/docs/seed-new-game';
import { StaffPreviewService } from '../../../shared/moderation/staff-preview.service';
import { EditorModeService } from '../state/editor-mode.service';
import { HostElectionService } from './host-election.service';
import { SessionPresenceService } from './session-presence.service';
import { LOAD_ORIGIN, type SavedSession, SessionSaveService } from './session-save.service';

export type SessionStatus = 'joining' | 'loading' | 'upgrading' | 'ready' | 'error' | 'closed';

/** The statuses of a session still being opened, when what is written is the load's and no edit. */
const OPENING: readonly SessionStatus[] = ['joining', 'loading', 'upgrading'];

/**
 * Whose game a session loaded once shows: someone else's, read as staff through the preview
 * routes, or the reader's own, read through the ordinary ones while their account is suspended.
 */
export type PreviewKind = 'staff' | 'own';

/**
 * One session on one project, opened the way the account may have it. A collaborator gets the
 * live one: it joins the work session, loads and migrates the game document, connects y-webrtc,
 * and opens and closes the saving, host election and presence that ride on it. Anyone who may
 * only look gets the last save, loaded once, with the editor's mode held to read-only. Provided
 * by the editor shell so all tabs share it; closing the shell leaves the session.
 */
@Injectable()
export class WorkSessionService implements SavedSession {
  private readonly auth = inject(AuthStore);
  private readonly config = inject(AppConfigService);
  private readonly i18n = inject(TranslocoService);
  private readonly saves = inject(SessionSaveService);
  private readonly election = inject(HostElectionService);
  private readonly presence = inject(SessionPresenceService);
  private readonly previews = inject(StaffPreviewService);
  private readonly mode = inject(EditorModeService);
  private readonly crashes = inject(CrashReporter);

  readonly status = signal<SessionStatus>('joining');
  readonly error = signal<string | null>(null);
  readonly ready = computed(() => this.status() === 'ready');
  readonly project = signal<ProjectExResponseDto | null>(null);
  /**
   * Whose game was loaded once to be looked at, or null for a live session. A game looked at
   * joins no work session and connects no peer, and nothing of it is saved. It is about how the
   * session was opened; whether an editor may write is the mode's to say.
   */
  readonly preview = signal<PreviewKind | null>(null);

  readonly doc = new Y.Doc();
  /**
   * The gate is open while the session opens: loading seeds what the document lacks, which is
   * nobody's edit. Once it is open the mode decides.
   */
  readonly game = new EditableGame(
    this.doc,
    () => OPENING.includes(this.status()) || this.mode.canWrite(),
  );

  private provider: WebrtcProvider | null = null;
  private projectId = '';
  private closing = false;
  /** Set while a guest waits for the host's upgrade; settles that wait without it. */
  private stopWaitingForSchema: (() => void) | null = null;
  /**
   * What the upgrade this client ran could not rewrite, each on the line it left, for the editor
   * to point at. Only the client that ran it knows; the others open a document already upgraded.
   */
  readonly migrationWarnings = signal<readonly MigrationWarning[]>([]);
  /** On the project, as its creator or one of its collaborators — not merely in the room. */
  readonly isCollaborator = computed(() => {
    const me = this.auth.userId();
    const project = this.project();
    return (
      this.preview() === null &&
      me !== null &&
      !!project &&
      (project.creator.id === me ||
        project.collaborators.some((collaborator) => collaborator.id === me))
    );
  });

  /**
   * A local write that reaches the document while the mode does not write went round the gate
   * and the controls both. Nothing can take it back, so it is reported as a fault of the app:
   * the gate's tests cannot see a write made on a Yjs type directly.
   */
  private readonly reportStrayWrite = (
    _update: Uint8Array,
    origin: unknown,
    _doc: Y.Doc,
    transaction: Y.Transaction,
  ): void => {
    if (
      transaction.local &&
      origin !== LOAD_ORIGIN &&
      origin !== MIGRATION_ORIGIN &&
      this.ready() &&
      !this.mode.canWrite()
    ) {
      this.crashes.report(
        'web',
        new Error(`The game document was written in ${this.mode.mode()} mode`),
      );
    }
  };

  constructor() {
    this.saves.attach(this);
    this.doc.on('update', this.reportStrayWrite);
    inject(DestroyRef).onDestroy(() => {
      void this.close();
    });
  }

  get id(): string {
    return this.projectId;
  }

  /** The project a game run from here may host or join a session on. None for a game looked at. */
  get playProjectId(): string | null {
    return this.preview() ? null : this.projectId;
  }

  get myUserId(): string | null {
    return this.auth.userId();
  }

  get displayName(): string {
    return this.auth.displayName();
  }

  /** The document as the server stores it: one update, encoded for upload. */
  snapshot(): Blob {
    return new Blob([Y.encodeStateAsUpdate(this.doc) as BlobPart], {
      type: 'application/octet-stream',
    });
  }

  private readonly onAwarenessChange = (changes: {
    added: number[];
    updated: number[];
    removed: number[];
  }): void => {
    const gone = this.presence.refresh(changes.removed);
    if (gone.length) {
      void this.election.onPeersLeft(gone);
    }
  };

  /** Joins the room's peers and starts telling them who this client is. */
  private connect(roomId: string, offer: WebRtcOfferDto): void {
    const signaling = offer.signaling.map((url) => this.config.reachable(url));
    this.provider = new WebrtcProvider(roomId, this.doc, {
      signaling,
      peerOpts: offer.peerOpts,
      maxConns: offer.maxConns,
    });
    this.presence.connect(this.provider.awareness);
    this.provider.awareness.on('change', this.onAwarenessChange);
    if (!this.election.isHost()) {
      this.election.watchForAbsentHost();
    }
  }

  /** Code and assets a docs page left for the new game; both go in once, in one transaction. */
  private applySeedCode(saved: boolean): void {
    if (!this.election.isHost()) {
      return;
    }
    const key = `${SEED_KEY}.${this.projectId}`;
    const json = sessionStorage.getItem(key);
    if (!json) {
      return;
    }
    sessionStorage.removeItem(key);
    const seed = JSON.parse(json) as GameSeed;
    // A seed is left for a game that has never been saved; any other game it would overwrite.
    if (saved) {
      return;
    }
    const entry = this.game.entryFile;
    if (!entry) {
      return;
    }
    this.game.transact(() => {
      entry.text.delete(0, entry.text.length);
      entry.text.insert(0, seed.code);
      if (seed.assets) {
        applyTutorialAssets(this.game, seed.assets);
      }
    });
  }

  private seedMeta(details: ProjectExResponseDto): void {
    const set = (key: string, value: string): void => {
      const text = this.doc.getText(key);
      if (!value || text.toString() === value) {
        return;
      }
      // A host's save writes the document's fields to the server, so the two disagree at open only
      // where the server renamed the game, as it does for a fork, or refused what the document held.
      if (text.length === 0 || this.election.isHost()) {
        text.delete(0, text.length);
        text.insert(0, value);
      }
    };
    this.doc.transact(() => {
      set(KEYS.projectName, details.name);
      set(KEYS.shortDescription, details.shortDesc ?? '');
      set(KEYS.longDescription, details.longDesc ?? '');
      set(KEYS.projectTags, JSON.stringify(details.tags ?? []));
    }, LOAD_ORIGIN);
  }

  private waitForSchema(): Promise<void> {
    return new Promise((resolve) => {
      const meta = this.doc.getMap('game.meta');
      // Against the current schema, not merely against "a number": on a document one schema behind,
      // any-number is true from the start, so a peer would sail past this and start editing the old
      // shape while the host is still bringing it forward.
      const check = (): void => {
        const version = meta.get('schemaVersion');
        if (typeof version === 'number' && version >= GAME_SCHEMA_VERSION) {
          this.stopWaitingForSchema?.();
        }
      };
      this.stopWaitingForSchema = () => {
        meta.unobserve(check);
        this.stopWaitingForSchema = null;
        resolve();
      };
      meta.observe(check);
      check();
    });
  }

  /** Asks the browser to confirm leaving while the host holds edits the server has not seen. */
  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (!this.preview() && this.election.isHost() && this.saves.dirty()) {
      event.preventDefault();
    }
  }

  onPageHide(event: PageTransitionEvent): void {
    if (this.preview()) {
      return;
    }
    if (this.election.isHost() && this.saves.dirty()) {
      void this.saves.save({ keepalive: true });
    }
    // A tab that is gone for good must stop being the recorded host, or no one else is elected.
    if (!event.persisted && this.projectId && this.status() === 'ready') {
      void workSessionControllerLeave({ path: { id: this.projectId }, keepalive: true });
    }
  }

  /** The game file as its collaborators read it, or null when nothing was saved yet. */
  private async ownContent(projectId: string): Promise<Uint8Array | null> {
    const blob = unwrap(
      await projectContentControllerFetchProjectContent({
        path: { id: projectId },
        parseAs: 'blob',
      }),
    ) as Blob | undefined;
    return blob && blob.size > 0 ? new Uint8Array(await blob.arrayBuffer()) : null;
  }

  /**
   * Joins the session, then loads, connects, upgrades and seeds the document one step at a time.
   *
   * The session can be closed during any wait, and a step that ran after that would revive what
   * `close` took down, so the one check for it sits between the steps rather than inside each.
   */
  private async openLive(projectId: string, details: ProjectExResponseDto): Promise<void> {
    const session = unwrap(await workSessionControllerJoin({ path: { id: projectId } }));
    if (this.closing) {
      // Closed while the join was in flight, so the leave `close` sent may have reached the
      // server before it.
      await workSessionControllerLeave({ path: { id: projectId } }).catch(() => undefined);
      return;
    }
    this.election.start(projectId, session.hostId, () => {
      if (needsMigration(this.doc)) {
        this.migrationWarnings.set(migrateGame(this.doc).warnings);
      }
      this.saves.startAutosave();
    });

    let bytes: Uint8Array | null = null;
    const steps: (() => unknown)[] = [
      async () => {
        this.status.set('loading');
        bytes = await this.ownContent(projectId);
      },
      () => {
        if (bytes) {
          Y.applyUpdate(this.doc, bytes, LOAD_ORIGIN);
        }
        if (isFromFutureSchema(this.doc)) {
          throw new Error(this.i18n.translate('editor.tooNew'));
        }
      },
      () => {
        this.connect(session.roomId, session.webrtcOffer);
      },
      async () => {
        if (!needsMigration(this.doc)) {
          return;
        }
        if (this.election.isHost()) {
          this.migrationWarnings.set(migrateGame(this.doc).warnings);
        } else {
          this.status.set('upgrading');
          await this.waitForSchema();
        }
      },
      () => {
        this.game.seedDefaults();
        this.applySeedCode(bytes !== null);
        this.project.set(details);
        this.seedMeta(details);
      },
      async () => {
        this.saves.dirty.set(false);
        this.status.set('ready');
        if (this.election.isHost()) {
          await this.saves.save();
        }
      },
      () => {
        if (this.election.isHost()) {
          this.saves.startAutosave();
        }
      },
    ];
    for (const step of steps) {
      await step();
      if (this.closing) {
        return;
      }
    }
  }

  /**
   * Opens the game to look at and nothing more: two reads, then a local copy of the document,
   * with the mode held to read-only.
   *
   * It joins no work session, elects no host, connects no peer and starts no save. An older
   * document is brought forward in this copy alone. Every request it makes is a GET, and no
   * request follows it: that is what lets staff open someone's draft, and a suspended account its
   * own game, without either of them changing anything.
   */
  private async openPreview(projectId: string, kind: PreviewKind): Promise<void> {
    this.preview.set(kind);
    this.mode.impose('read-only');
    this.status.set('loading');
    const [bytes, details] = await Promise.all([
      kind === 'staff' ? this.previews.content(projectId) : this.ownContent(projectId),
      kind === 'staff'
        ? this.previews.project(projectId)
        : projectControllerFindOne({ path: { id: projectId } }).then(unwrap),
    ]);
    if (this.closing) {
      return;
    }
    if (bytes) {
      Y.applyUpdate(this.doc, bytes, LOAD_ORIGIN);
    }
    if (isFromFutureSchema(this.doc)) {
      throw new Error(this.i18n.translate('editor.tooNew'));
    }
    if (needsMigration(this.doc)) {
      this.migrationWarnings.set(migrateGame(this.doc).warnings);
    }
    this.game.seedDefaults();
    this.project.set(details);
    this.seedMeta(details);
    this.saves.dirty.set(false);
    this.status.set('ready');
  }

  /**
   * Opens the project the way the account may have it, and decides that alone. A suspended
   * account looks at the game. Otherwise the project is asked for as its collaborators read it:
   * answered, the account is one and gets the live session; refused, a staff member looks at
   * the game and anyone else is told it cannot be opened.
   */
  async open(projectId: string): Promise<void> {
    this.projectId = projectId;
    try {
      if (this.auth.suspension()) {
        await this.openPreview(projectId, 'own');
        return;
      }
      const asked = await projectControllerFindOne({ path: { id: projectId } });
      if (this.closing) {
        return;
      }
      if (asked.response?.status === 403 && this.auth.isStaff()) {
        await this.openPreview(projectId, 'staff');
        return;
      }
      await this.openLive(projectId, unwrap(asked));
    } catch (error) {
      if (this.closing) {
        return;
      }
      this.error.set(error instanceof Error ? error.message : 'Could not open this game');
      this.status.set('error');
    }
  }

  async close(): Promise<void> {
    if (this.closing) {
      return;
    }
    this.closing = true;
    if (this.preview()) {
      this.saves.stop();
      this.doc.destroy();
      this.status.set('closed');
      return;
    }
    this.election.stop();
    this.saves.stop();
    this.stopWaitingForSchema?.();
    // y-webrtc allows one provider per room name per process, and the next shell on this project
    // opens that room while the save and leave below are still in flight.
    this.provider?.awareness.off('change', this.onAwarenessChange);
    this.presence.disconnect();
    this.provider?.destroy();
    this.provider = null;
    try {
      if (this.election.isHost() && this.saves.dirty()) {
        await this.saves.save();
      }
    } catch {
      /* best effort */
    }
    try {
      if (this.projectId) {
        await workSessionControllerLeave({ path: { id: this.projectId } });
      }
    } catch {
      /* session may already be gone */
    }
    this.doc.destroy();
    this.status.set('closed');
  }
}
