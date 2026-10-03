import {
  computed,
  inject,
  Injectable,
  type Signal,
  signal,
  type WritableSignal,
} from '@angular/core';
import {
  projectContentControllerSaveCheckpoint,
  projectContentControllerSaveProjectContent,
  projectControllerFindOne,
  projectControllerUpdate,
  type ProjectExResponseDto,
} from '@naucto/api-client';
import { KEYS } from '@naucto/engine';
import { QueryClient } from '@tanstack/angular-query-experimental';
import type * as Y from 'yjs';

import { unwrap } from '../../../core/api/api-errors';
import { invalidateProjectHistory } from '../../../shared/queries/projects.queries';
import { qk } from '../../../shared/queries/query-keys';
import { parseTags } from '../state/project-tags';
import { HostElectionService } from './host-election.service';

const AUTOSAVE_MS = 5 * 60 * 1000;
/**
 * How long the document must sit still before it is written out: long enough that a line being
 * typed is one save, short enough that stepping away leaves nothing unsaved. The server groups
 * saves that follow each other closely, so a pause costs no extra history.
 */
const QUIET_SAVE_MS = 3000;

/** What a save reads of the session it writes out. */
export interface SavedSession {
  readonly doc: Y.Doc;
  readonly id: number;
  /** The project as the server last described it; a save that changes its metadata updates it. */
  readonly project: WritableSignal<ProjectExResponseDto | null>;
  /** Open for writing: false while the session loads, and again once it has failed or closed. */
  readonly ready: Signal<boolean>;
  /** The document as the server stores it. */
  snapshot(): Blob;
}

/**
 * Writes the session out: the host on a quiet pause and on a timer, any collaborator on a click,
 * and tracks whether the server holds the latest edit.
 */
@Injectable()
export class SessionSaveService {
  private readonly queries = inject(QueryClient);
  private readonly election = inject(HostElectionService);
  private attached: SavedSession | null = null;
  private autosave: ReturnType<typeof setInterval> | null = null;
  private quiet: ReturnType<typeof setTimeout> | null = null;
  /** Bumped by every local or remote change, so a save knows whether it covered the latest one. */
  private edits = 0;

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
  readonly synced = computed(() => this.session.ready() && !this.saving() && !this.saveFailed());

  private get session(): SavedSession {
    if (!this.attached) {
      throw new Error('No session is attached to save');
    }
    return this.attached;
  }

  private meta(): { name: string; shortDesc: string; longDesc: string; tags: string[] } {
    const doc = this.session.doc;
    return {
      name: doc.getText(KEYS.projectName).toString(),
      shortDesc: doc.getText(KEYS.shortDescription).toString(),
      longDesc: doc.getText(KEYS.longDescription).toString(),
      tags: parseTags(doc.getText(KEYS.projectTags).toString()),
    };
  }

  /**
   * Invalidates every query that shows this project's metadata or serves its released content: each
   * screen caches them under a key of its own, and the editor's signal is only one of the copies.
   */
  private async invalidateProjectEverywhere(): Promise<void> {
    const id = this.session.id;
    await Promise.all([
      this.queries.invalidateQueries({ queryKey: qk.release(id) }),
      this.queries.invalidateQueries({ queryKey: qk.releaseContentUrl(id) }),
      this.queries.invalidateQueries({ queryKey: qk.releasesAll() }),
      this.queries.invalidateQueries({ queryKey: qk.projectsAll() }),
      this.queries.invalidateQueries({ queryKey: qk.profileAll() }),
    ]);
  }

  /**
   * Write the document out once the edits stop.
   *
   * Pushed back by every change, so it fires on the pause rather than during the typing. Guarded
   * by `save` itself, which is a no-op for a guest and before the session is ready.
   */
  private saveWhenQuiet(): void {
    if (this.quiet) {
      clearTimeout(this.quiet);
    }
    this.quiet = setTimeout(() => {
      this.quiet = null;
      // Swallowed for the same reason the interval swallows it: `save` has recorded the failure,
      // and a timer has nobody to rethrow to.
      if (this.dirty()) {
        void this.save().catch(() => undefined);
      }
    }, QUIET_SAVE_MS);
  }

  /**
   * Persist the document and any changed project metadata.
   *
   * One writer on the timer; anyone on a click. `force` is that click: a publish or a named
   * version has to carry the state it names, whoever pressed the button.
   */
  async save(opts: { keepalive?: boolean; force?: boolean } = {}): Promise<void> {
    const session = this.attached;
    if (!session || (!this.election.isHost() && !opts.force) || !session.ready()) {
      return;
    }
    this.saving.set(true);
    try {
      const edits = this.edits;
      // The generated client resolves a refused request as a value, not a throw; a save the server
      // turned down must not go on to clear the dirty flag below.
      unwrap(
        await projectContentControllerSaveProjectContent({
          path: { id: session.id },
          body: { file: session.snapshot() },
          ...(opts.keepalive ? { keepalive: true } : {}),
        }),
      );
      const details = session.project();
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
            path: { id: session.id },
            body: {
              name,
              shortDesc: meta.shortDesc,
              longDesc: meta.longDesc,
              tags: meta.tags,
            },
          }),
        );
        session.project.set({ ...details, ...(updated as Partial<ProjectExResponseDto>) });
        await this.invalidateProjectEverywhere();
      }
      if (this.edits === edits) {
        this.dirty.set(false);
      } else {
        this.saveWhenQuiet();
      }
      this.saveFailed.set(false);
      this.lastSavedAt.set(new Date());
      // Every save is a new autosave on the server, and the panel listing them would otherwise
      // hold the list as it stood when the editor opened.
      await invalidateProjectHistory(this.queries, session.id, 'versions');
    } catch (error) {
      this.saveFailed.set(true);
      throw error;
    } finally {
      this.saving.set(false);
    }
  }

  private readonly onDocUpdate = (_update: Uint8Array, origin: unknown): void => {
    if (origin === 'remote-init') {
      return;
    }
    this.edits++;
    this.dirty.set(true);
    this.saveWhenQuiet();
  };

  /** Counts the session's edits from now on; `stop` lets go of its document. */
  attach(session: SavedSession): void {
    this.attached = session;
    session.doc.on('update', this.onDocUpdate);
  }

  startAutosave(): void {
    if (this.autosave) {
      return;
    }
    this.autosave = setInterval(() => {
      // Swallowed here because `save` has already recorded it; rethrowing would only reach a
      // timer, which has nobody to tell.
      if (this.dirty()) {
        void this.save().catch(() => undefined);
      }
    }, AUTOSAVE_MS);
  }

  /** Stops every timed save and the edit count; an explicit `save` still goes through. */
  stop(): void {
    if (this.autosave) {
      clearInterval(this.autosave);
    }
    this.autosave = null;
    if (this.quiet) {
      clearTimeout(this.quiet);
    }
    this.quiet = null;
    this.session.doc.off('update', this.onDocUpdate);
  }

  async saveCheckpoint(name: string): Promise<void> {
    const session = this.session;
    unwrap(
      await projectContentControllerSaveCheckpoint({
        path: { id: String(session.id), name },
        body: { file: session.snapshot() },
      }),
    );
    await invalidateProjectHistory(this.queries, session.id, 'checkpoints');
  }

  async refreshProject(): Promise<void> {
    const session = this.session;
    session.project.set(unwrap(await projectControllerFindOne({ path: { id: session.id } })));
    await this.invalidateProjectEverywhere();
  }
}
