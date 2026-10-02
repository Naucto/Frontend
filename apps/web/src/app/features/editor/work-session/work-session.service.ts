import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { isWorthRetrying, unwrap } from '@app/core/api/api-errors';
import { AuthStore } from '@app/core/auth/auth.store';
import { AppConfigService } from '@app/core/config/app-config';
import { invalidateProjectHistory } from '@app/shared/queries/projects.queries';
import { qk } from '@app/shared/queries/query-keys';
import { TranslocoService } from '@jsverse/transloco';
import {
  aiControllerApply,
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
  applyTutorialAssets,
  encodeState,
  Game,
  GAME_SCHEMA_VERSION,
  isFromFutureSchema,
  LOCAL_ORIGIN,
  migrateGame,
  needsMigration,
  type TutorialAssets,
} from '@naucto/engine';
import type { PresenceColour } from '@naucto/ui';
import { QueryClient } from '@tanstack/angular-query-experimental';
import type { Awareness } from 'y-protocols/awareness';
import { WebrtcProvider } from 'y-webrtc';
import * as Y from 'yjs';

import { seedText } from './meta-seed';
import { assignColours } from './presence-colours';
import { SaveTracker } from './save-tracker';

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
 * election, and saves (the host on a timer, any collaborator on a click).
 * Provided at the editor route so all tabs share it; closing the route leaves
 * the session.
 */
/** A region of a file that an accepted assistant change moved. */
export interface AiMark {
  readonly proposalId: string;
  readonly fileId: string;
  readonly title: string;
  readonly from: Y.RelativePosition;
  readonly to: Y.RelativePosition;
}

/**
 * The marks an accepted change leaves behind, given the text each file held before it.
 *
 * Separate from the service so it can be tested without a session, an API and a provider: this is
 * where the decision of what to mark actually lives.
 */
export function computeAiMarks(
  doc: Y.Doc,
  before: Map<string, string>,
  proposalId: string,
  title: string,
): AiMark[] {
  const marks: AiMark[] = [];
  for (const [fileId, file] of doc.getMap<Y.Map<Y.Text>>('code.files')) {
    const text = file.get('text');
    if (!(text instanceof Y.Text)) continue;
    const previous = before.get(fileId);
    // A file the change did not touch, or one that held nothing, has nothing to point at.
    if (previous === undefined || previous === text.toString()) continue;
    const [from, to] = changedRange(previous, text.toString());
    if (from === to) continue;
    marks.push({
      proposalId,
      fileId,
      title,
      from: Y.createRelativePositionFromTypeIndex(text, from),
      // Associated with the character before, not the one after. A position at the end of a text
      // is the same whether the index is the length or one past it, and it associates forward, so
      // the mark grew to cover whatever was typed below the change afterwards. The character before
      // is stable: text added after it stays outside the mark.
      to: Y.createRelativePositionFromTypeIndex(text, to, -1),
    });
  }
  return marks;
}

/**
 * The marks left once a change is reverted. Marks of the change being undone go with it; the revert
 * itself is marked in its own right, under its own title.
 */
export function withoutProposal(marks: readonly AiMark[], proposalId: string): AiMark[] {
  return marks.filter((mark) => mark.proposalId !== proposalId);
}

/**
 * The text of every Lua file in an encoded document, by id.
 *
 * Read from the state that was sent rather than from the live document, because between sending and
 * the reply arriving a person can type, and a colleague's keystrokes can be relayed. Read from the
 * live document instead, all of that looks like part of the assistant's change — in files the
 * proposal never touched.
 */
export function codeTextFrom(encoded: string): Map<string, string> {
  const doc = new Y.Doc();
  try {
    Y.applyUpdate(
      doc,
      Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0)),
    );
    return codeText(doc);
  } finally {
    doc.destroy();
  }
}

/** The text of every Lua file in a document, by id. */
function codeText(doc: Y.Doc): Map<string, string> {
  const files = new Map<string, string>();
  for (const [fileId, file] of doc.getMap<Y.Map<Y.Text>>('code.files')) {
    const text = file.get('text');
    if (text instanceof Y.Text) files.set(fileId, text.toString());
  }
  return files;
}

/**
 * The line range that differs between two versions of a file, as offsets into the new text.
 *
 * Lines that survived the change are excluded: a whole-file replacement shares no text with what it
 * replaced, so comparing lines is what leaves a person looking at the part that actually moved rather
 * than at the whole file. Returns an empty range when nothing differs, which the caller treats as
 * "nothing to mark".
 */
export function changedRange(before: string, after: string): [number, number] {
  const oldLines = before.split('\n');
  const newLines = after.split('\n');
  let start = 0;
  while (start < oldLines.length && start < newLines.length && oldLines[start] === newLines[start])
    start += 1;
  let oldEnd = oldLines.length - 1;
  let newEnd = newLines.length - 1;
  while (oldEnd >= start && newEnd >= start && oldLines[oldEnd] === newLines[newEnd]) {
    oldEnd -= 1;
    newEnd -= 1;
  }
  if (start > newEnd) return [0, 0];
  // Offsets into the new text: the shared lines above the change, then the change itself, counting
  // the newline that separates each line from the next.
  const offsetOf = (index: number): number => {
    let offset = 0;
    for (let i = 0; i < index; i += 1) offset += newLines[i]?.length ?? 0;
    return offset + index;
  };
  // Clamped to the text: `offsetOf(newEnd + 1)` counts the newline after the last line, which does
  // not exist, and an index one past the end becomes a relative position with no item, which then
  // resolves to the end of the text — so a mark for a change at the end of a file would quietly
  // stretch to cover whatever is typed below it.
  const from = Math.min(offsetOf(start), after.length);
  const to = Math.min(Math.max(from, offsetOf(newEnd + 1)), after.length);
  return [from, to];
}

/**
 * Mirrors PROJECT_NAME_MAX_LENGTH in the Backend's project-field-limits. The server is the
 * authority; this copy exists so the editor can recognise a name it must not send rather than
 * discovering it as a rejected save.
 */
const PROJECT_NAME_MAX_LENGTH = 25;

@Injectable()
export class WorkSessionService {
  /**
   * Marks an accepted change, so a write that came from the assistant is distinguishable from a
   * person typing — the same thing the old barrier needed an origin for, without the pause.
   */
  static readonly APPLIED_ORIGIN = 'ai-applied';

  /** The body size a browser accepts on a `keepalive` request. Above it, the request is dropped. */
  private static readonly KEEPALIVE_LIMIT = 64 * 1024;

  /** Tells a finished save whether it uploaded everything the document holds. */
  private readonly tracker = new SaveTracker();
  /**
   * The revision the last successful upload was taken at, or null if nothing has been stored yet.
   *
   * Distinct from `lastSavedAt`, which is a time and answers "did a save succeed"; this answers "how
   * much of the document is in storage", which is what decides whether a change the assistant made
   * is safe. A later save that failed, or one taken before the change, leaves it behind.
   */
  private lastSavedFrom: number | null = null;
  /** The oldest applied change not yet confirmed in storage, or null when there is none. */
  private unstoredApplied: number | null = null;
  /** Where accepted assistant changes are marked, in each file's own text. */
  readonly aiMarks = signal<readonly AiMark[]>([]);
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
  private kicking = false;
  private readonly known = new Map<number, AwarenessState>();

  readonly status = signal<SessionStatus>('joining');
  readonly error = signal<string | null>(null);
  /**
   * Whoever the server elected to write the document out on the timer.
   *
   * That is the host's one job. Everyone holds the same document, so N peers each uploading it
   * on every pause would be N copies of one state; the rest — publish, name a version, restore —
   * is a click, and a click is one write whoever makes it.
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
      this.tracker.changed();
      this.dirty.set(true);
      this.saveWhenQuiet();
    };
    this.doc.on('update', onUpdate);
    const onBeforeUnload = (e: BeforeUnloadEvent): void => {
      // Anyone, not only the host. A non-host holding an applied change that has not reached storage
      // is the case this exists for: nothing else in a non-host's lifecycle would save it, so a tab
      // closed without this leaves the change only in the tab that accepted it.
      if (this.dirty() && (this.isHost() || this.unstoredApplied !== null)) e.preventDefault();
    };
    const onPageHide = (): void => {
      if (!this.isHost() || !this.dirty()) return;
      // `keepalive` is what lets a request outlive the page that sent it — but browsers cap a
      // keepalive body at 64 KiB, and a real project is megabytes, so the request this was relying
      // on was being dropped for everything that mattered. A document that fits is still sent that
      // way, because it is the only case where it is both small enough and worth the complexity.
      const bytes = Y.encodeStateAsUpdate(this.doc);
      if (bytes.byteLength <= WorkSessionService.KEEPALIVE_LIMIT) {
        void this.save({ keepalive: true });
        return;
      }
      // Too big to go with the page, so send it now, while the page is still alive. It is a normal
      // request with no deadline of its own, which is exactly what was wanted from `keepalive`, and
      // nothing about the document is lost if the tab closes a moment later — the bytes are already
      // on the wire. Not awaited: `pagehide` will not wait, and there is no one left to wait for.
      void this.save();
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

  private readonly destroyRef = inject(DestroyRef);

  /**
   * Accept a proposal: send this document as it stands, apply what comes back.
   *
   * Nothing is paused and nobody is interrupted. The operations are merged into the state that was
   * just sent, so unsaved work here is respected, and the reply is that merged state rather than a
   * difference cut against this one: a difference is only meaningful to the client whose state
   * vector it was cut against, and y-webrtc relays the update to every tab. A state carries its own
   * dependencies, so a colleague who is behind or has typed since is not overwritten. An operation
   * whose `before` no longer matches is refused, which is what a changed-since-review looks like.
   */
  async applyAiProposal(
    id: string,
    contentHash: string,
    what: {
      title?: string;
      revertsId?: string | null;
      hunks?: { fileId: string; from: number; to: number }[];
    } = {},
  ): Promise<string[]> {
    const hunks = what.hunks ?? [];
    // Exactly what is sent, and the only thing the server had to merge into. Reading the live
    // document instead would compare the reply against whatever the document has become in the
    // meantime — anything typed here, or relayed from a colleague, while the request was in flight
    // would look like part of the assistant's change, in files the proposal never touched.
    const snapshot = encodeState(this.doc);
    const result = unwrap(
      await aiControllerApply({
        path: { projectId: this.projectId, proposalId: id },
        // `hunks` narrows a code change to the lines the person chose. Absent, the whole change is
        // applied, which is what the button said it would do.
        body: { decision: 'APPROVED', contentHash, snapshot, ...(hunks.length ? { hunks } : {}) },
      }),
    );
    const before = codeTextFrom(snapshot);
    const update = Uint8Array.from(atob(result.update), (c) => c.charCodeAt(0));
    Y.applyUpdate(this.doc, update, WorkSessionService.APPLIED_ORIGIN);
    // Diffed against the state the server sent, not the live document. The live document has
    // everything typed here, or relayed from a colleague, since the request went out, and diffing
    // against that marked all of it as the assistant's — in files the proposal never touched, and
    // in the change's own file, which is the place somebody looks to see what the assistant did.
    // Relative positions carry item ids, so positions built against this document resolve in the
    // live one.
    this.markAiChange(id, what.title ?? '', before, update);
    // Saved at once, and as a forced save, because anybody may accept a change — not only the host —
    // and the server no longer writes one itself. A non-host's `save` returns early, so an accepted
    // change was reaching storage only if y-webrtc happened to relay it to the host; where that
    // failed the change lived in one tab until it closed, while the database already recorded it as
    // applied. Now that saves merge, a non-host writing is harmless: it cannot lose what is stored,
    // and it is the accepting editor that has the change.
    // Not `save()` and not `dirty`: a non-host's `save` returns early, the quiet timer and the
    // interval are the host's alone, and `pagehide` checks the host too. So for a non-host none of
    // the existing paths would ever retry, and one failed save left the change in that tab alone
    // while the database already recorded it as applied. Retried here until a save that began at or
    // after the apply has actually succeeded — a later failure over an unrelated change must not
    // stop the retry, so it is compared against the revision at apply time, not against `dirty`.
    const appliedAt = this.tracker.mark();
    // Kept while it is unstored, and only then. The host's `dirty` cannot be used for this: every
    // relayed update sets it, so it says the document has changes, not that this change is missing.
    this.unstoredApplied =
      this.unstoredApplied === null ? appliedAt : Math.min(this.unstoredApplied, appliedAt);
    void this.persistApplied(appliedAt);
    // Applying a revert takes the original's lines back, so the original's marks no longer describe
    // them. Its own change is marked in its own right, under the revert's own title.
    if (what.revertsId) this.clearAiMarks(what.revertsId);
    return result.categories;
  }

  /**
   * Record which lines an accepted change moved, so a person can see what came from the assistant
   * rather than having to remember it.
   *
   * Positions are Yjs relative positions, not line numbers: a colleague typing above the change
   * shifts every number, and a relative position follows the text it points at. A whole-file
   * replacement — which is what a `code` operation is — has no shared region with the old text, so
   * it is compared as lines and only the lines that actually differ are marked.
   */
  private markAiChange(
    proposalId: string,
    title: string,
    before: Map<string, string>,
    update: Uint8Array,
  ): void {
    const applied = new Y.Doc();
    try {
      Y.applyUpdate(applied, update);
      const marks = computeAiMarks(applied, before, proposalId, title);
      if (!marks.length) return;
      // Capped, so a long session of accepted changes does not accumulate marks nobody is reading.
      this.aiMarks.update((current) => [...marks, ...current].slice(0, 40));
    } finally {
      applied.destroy();
    }
  }

  /** Forget a change's marks, which is what reverting it should do: the lines are no longer its. */
  clearAiMarks(proposalId: string): void {
    this.aiMarks.update((current) => withoutProposal(current, proposalId));
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
      this.hostId = session.hostId;
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
   *
   * The play page's download is here for the same reason: a publish or a release update swaps
   * the blob its signed URL points at, and it is fetched under a key of its own.
   */
  /**
   * A name in the document that the API will not accept, held so the editor can say so.
   *
   * Silent repair would leave a person who had deliberately typed a long name with a project that
   * quietly reverted to the server's copy and no idea why. Visible is better than either.
   */
  readonly strandedName = signal<string | null>(null);

  private async invalidateProjectEverywhere(): Promise<void> {
    await Promise.all([
      this.queries.invalidateQueries({ queryKey: qk.release(this.projectId) }),
      this.queries.invalidateQueries({ queryKey: qk.releaseContentUrl(this.projectId) }),
      this.queries.invalidateQueries({ queryKey: qk.releasesAll() }),
      this.queries.invalidateQueries({ queryKey: ['projects'] }),
      this.queries.invalidateQueries({ queryKey: ['profile'] }),
    ]);
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
      const details = this.project();
      const meta = this.meta();
      if (
        details &&
        (details.name !== meta.name ||
          (details.shortDesc ?? '') !== meta.shortDesc ||
          (details.longDesc ?? '') !== meta.longDesc ||
          JSON.stringify([...details.tags].sort()) !== JSON.stringify([...meta.tags].sort()))
      ) {
        // A name the API would refuse must not take the document down with it. This call sits in
        // front of the upload, so a rejected name aborted the save — and a project whose own
        // metadata had drifted too long could no longer be opened, which is the worst way for a
        // validation message to arrive: there was nothing to open it with. The server's copy is
        // authoritative anyway, so fall back to it and carry on saving.
        const name = meta.name.length > PROJECT_NAME_MAX_LENGTH ? (details.name ?? '') : meta.name;
        if (name !== meta.name) {
          this.strandedName.set(meta.name);
        }
        const updated = unwrap(
          await projectControllerUpdate({
            path: { id: this.projectId },
            body: {
              name,
              shortDesc: meta.shortDesc,
              longDesc: meta.longDesc as unknown as Record<string, unknown>,
              tags: meta.tags,
            },
          }),
        );
        this.project.set({ ...details, ...(updated as Partial<ProjectExResponseDto>) });
        await this.invalidateProjectEverywhere();
      }
      // The revision is read before encoding, because the upload is a round trip and the document
      // keeps moving while it is out. Anything applied after this line — a change accepted from the
      // assistant, a keystroke, a peer's edit — is not in the bytes being uploaded, so the dirty
      // flag must not be cleared on its account. Clearing it regardless lost exactly that: the
      // change sat in the document, the flag said there was nothing to save, and closing the tab
      // then stored nothing at all. With the assistant's changes reaching storage only through this
      // flag, that was the only route to persistence.
      const encodedAt = this.tracker.mark();
      const bytes = Y.encodeStateAsUpdate(this.doc);
      // The generated client resolves a refused request as a value, not a throw; a save the server
      // turned down must not go on to clear the dirty flag below.
      unwrap(
        await projectControllerSaveProjectContent({
          path: { id: this.projectId },
          body: { file: new Blob([bytes as BlobPart], { type: 'application/octet-stream' }) },
          ...(opts.keepalive ? { keepalive: true } : {}),
        }),
      );
      // Only what was encoded counts as saved. If the document moved on, it stays dirty and the
      // quiet-period timer or the next pause picks it up.
      // The bytes encoded at `encodedAt` are now in storage, whatever the document did since.
      // Never lowered: saves have no in-flight guard, so an older one can finish after a newer one
      // and would otherwise report less stored than it is. That can only cause extra retries, but
      // an extra retry is cheaper than a wrong answer.
      this.lastSavedFrom = Math.max(this.lastSavedFrom ?? 0, encodedAt);
      if (this.tracker.settled(encodedAt)) this.dirty.set(false);
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

  /** Code and assets a docs page left for the new game; both go in once, in one transaction. */
  private applySeedCode(): void {
    if (!this.isHost()) return;
    const code = sessionStorage.getItem('naucto.seed-code');
    if (!code) return;
    sessionStorage.removeItem('naucto.seed-code');
    const assetsJson = sessionStorage.getItem('naucto.seed-assets');
    sessionStorage.removeItem('naucto.seed-assets');
    const entry = this.game.entryFile;
    if (!entry) return;
    this.doc.transact(() => {
      entry.text.delete(0, entry.text.length);
      entry.text.insert(0, code);
      if (assetsJson) applyTutorialAssets(this.game, JSON.parse(assetsJson) as TutorialAssets);
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
      seedText(this.doc.getText(key), value);
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
   * Keep trying to store a change the assistant made, until a save covering it has succeeded.
   *
   * Backs off, because a store that is refusing saves is refusing them for a reason, and a tight
   * retry loop against a busy queue is how one busy project becomes every other project's problem.
   */
  private async persistApplied(appliedAt: number, attempt = 0): Promise<void> {
    try {
      await this.save({ force: true });
      // Stored at or after the change, which is the only thing that ends this. Not "a save
      // succeeded": a save taken before the change, or one that did not reach storage, leaves the
      // change exactly where it was.
      if (this.lastSavedFrom !== null && this.lastSavedFrom >= appliedAt) {
        if (this.unstoredApplied !== null && this.lastSavedFrom >= this.unstoredApplied)
          this.unstoredApplied = null;
        return;
      }
    } catch (error) {
      // The server has made a considered answer about these bytes — refused as unmergeable, too
      // large — and sending the same bytes again will be refused the same way. Anything else is the
      // moment rather than the message: a busy queue, a stalled store, a dropped connection. Those
      // are retried for as long as the tab is open, which is the whole point: a stopwatch limit
      // turns a two-minute store outage into a change that exists in one tab while the database says
      // it was applied.
      if (!isWorthRetrying(error)) return;
      if (this.destroyRef.destroyed) return;
    }
    // 1s, 2s, 4s, 8s, 16s, then a flat 30s. Capped rather than growing, so a long outage does not
    // settle into a delay no one will wait out. `appliedAt` is captured above and never re-read: a
    // change made in the meantime must not restart the wait, or a busy document would never settle.
    const delay = Math.min(1000 * 2 ** attempt, 30000);
    await new Promise((resolve) => setTimeout(resolve, delay));
    if (this.destroyRef.destroyed) return;
    void this.persistApplied(appliedAt, attempt + 1);
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
    this.hostId = this.auth.userId();
    this.isHost.set(true);
    if (needsMigration(this.doc)) migrateGame(this.doc);
    this.startAutosave();
  }
}
