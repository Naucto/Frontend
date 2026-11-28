import { computed, DestroyRef, effect, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  aiProjectControllerReview,
  aiProjectControllerWorkspaceOf,
  type AiWorkspaceReviewDto,
} from '@naucto/api-client';
import {
  type ChangeItem,
  computeChanges,
  decide,
  type Decision,
  decisionOf,
  DIFF_EDITORS,
  type DiffEditor,
  type DiffKind,
  displayState,
  EditableGame,
  type FileDiff,
  fileDiffs,
  keepLive,
  mergeAccepted,
  migrateGame,
  type SoundPart,
} from '@naucto/engine';
import * as Y from 'yjs';

import { unwrap } from '../../../core/api/api-errors';
import {
  injectProjectCheckpoints,
  injectProjectVersions,
} from '../../../shared/queries/projects.queries';
import { loadVersionDoc } from '../game/version-snapshot';
import { historyOf, type HistoryRow } from '../game/versions-popover.component';
import { EditorModeService } from '../state/editor-mode.service';
import { WorkSessionService } from '../work-session/work-session.service';

/**
 * One side of a comparison: `current`, the document open in the editor, or a saved version by its
 * key.
 */
export type SnapshotRef = string;

/**
 * `review` takes changes into the open document one at a time; `compare` only shows how two
 * versions differ and decides nothing.
 */
export type DiffMode = 'review' | 'compare';

/** The assistant's pending changes, written through the MCP: a side as a version is one. */
export const AI_REF = 'ai';

const toBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
};

type AiCategory = AiWorkspaceReviewDto['categories'][number];

const CATEGORY: Record<Exclude<DiffEditor, 'sound'>, AiCategory> = {
  // The actions are what the code reads the player by; there is no category of their own.
  game: 'CODE',
  code: 'CODE',
  art: 'SPRITES',
  map: 'MAPS',
  net: 'MULTIPLAYER',
};

/** What the kept changes touched, for the game's AI badge. */
function categoriesOf(kept: readonly ChangeItem[]): AiCategory[] {
  const out = new Set<AiCategory>();
  for (const item of kept) {
    if (item.type === 'sound') {
      out.add(item.part === 'sfx' ? 'SFX' : 'MUSIC');
    } else if (item.editor !== 'sound') {
      out.add(CATEGORY[item.editor]);
    }
  }
  return [...out];
}

/** How long the live document is left to settle before the changes are worked out again. */
const RECOMPUTE_MS = 300;

/**
 * Diff mode of one editing session: which two snapshots are set against each other, every change
 * between them, and what the person decided about each.
 *
 * Every change comes from a plain diff of the two snapshots, grouped here in the client. Nothing
 * is written while the mode is on (the editor mode is `diff`, which closes writing); `apply` is the
 * one step that writes, the kept changes merged into the open document at once.
 */
@Injectable()
export class DiffStore {
  private readonly session = inject(WorkSessionService);
  private readonly editorMode = inject(EditorModeService);
  private readonly router = inject(Router);

  readonly on = signal(false);
  readonly from = signal<SnapshotRef>('current');
  readonly to = signal<SnapshotRef>('current');

  private readonly versions = injectProjectVersions(() => this.session.id);
  private readonly checkpoints = injectProjectCheckpoints(() => this.session.id);
  /** Every saved version, newest first, as the versions popover lists them. */
  readonly history = computed<HistoryRow[]>(() =>
    historyOf(this.checkpoints.data() ?? [], this.versions.data() ?? []),
  );

  /** Saved versions loaded so far, by key. A version never changes once saved. */
  private readonly loaded = signal<ReadonlyMap<string, EditableGame>>(new Map());
  /** The documents under `loaded`, which a display is merged from. */
  private readonly docs = new Map<string, Y.Doc>();
  /**
   * What the editors draw while the mode is on: the changes not refused, as they would land.
   * A document of its own, written only here and never saved, so a canvas follows it as it
   * follows the project.
   */
  readonly viewGame = new EditableGame(new Y.Doc());
  private readonly viewReady = signal(false);
  /** The game an editor draws: the display in diff mode, the project otherwise. */
  readonly shown = computed(() =>
    this.on() && this.viewReady() ? this.viewGame : this.session.game,
  );
  readonly loading = signal(false);
  readonly loadFailed = signal(false);
  /** The assistant has written nothing to review yet. */
  readonly aiEmpty = signal(false);
  /** The revision of the assistant's save that was read, which a review names. */
  private aiRevision = 0;
  /** Moves when the open document changes, which no signal reports by itself. */
  private readonly tick = signal(0);

  readonly mode = computed<DiffMode>(() =>
    this.from() === 'current' && this.to() !== 'current' ? 'review' : 'compare',
  );

  private readonly snapshot = (ref: SnapshotRef): EditableGame | null => {
    this.tick();
    return ref === 'current' ? this.session.game : (this.loaded().get(ref) ?? null);
  };
  readonly before = computed(() => (this.on() ? this.snapshot(this.from()) : null));
  readonly after = computed(() => (this.on() ? this.snapshot(this.to()) : null));

  /** Every change, in rail order. Empty while either side is still loading. */
  readonly items = computed<ChangeItem[]>(() => {
    const before = this.before();
    const after = this.after();
    if (!before || !after || before === after) {
      return [];
    }
    const items = computeChanges(before, after);
    const order = (item: ChangeItem): number => DIFF_EDITORS.indexOf(item.editor);
    return items.sort((a, b) => order(a) - order(b));
  });

  /** The rows and hunks of each changed file, which the CODE tab draws. */
  readonly files = computed<Map<string, FileDiff>>(() => {
    const before = this.before();
    const after = this.after();
    return before && after && before !== after
      ? fileDiffs(before, after)
      : new Map<string, FileDiff>();
  });

  private readonly taken = signal<ReadonlyMap<string, Decision>>(new Map());
  /** What was decided, about the changes there still are. */
  readonly decisions = computed(() => keepLive(this.items(), this.taken()));

  readonly currentKey = signal<string | null>(null);

  readonly total = computed(() => this.items().length);
  readonly reviewed = computed(() => this.decisions().size);
  readonly pending = computed(() => this.items().filter((item) => !this.decisions().has(item.key)));

  /** What each rail tab shows: changes still to decide, or every change when only comparing. */
  readonly counts = computed<Record<DiffEditor, number>>(() => {
    const counts: Record<DiffEditor, number> = {
      game: 0,
      code: 0,
      art: 0,
      map: 0,
      sound: 0,
      net: 0,
    };
    const shown = this.mode() === 'review' ? this.pending() : this.items();
    for (const item of shown) {
      counts[item.editor] += 1;
    }
    return counts;
  });

  constructor() {
    effect(() => {
      this.editorMode.choose(this.on() ? 'diff' : 'normal');
    });
    effect(() => {
      if (this.on()) {
        void this.load(this.from());
        void this.load(this.to());
      }
    });
    effect(() => {
      const after = this.after();
      const items = this.items();
      const decisions = this.decisions();
      const from = this.from() === 'current' ? this.session.doc : this.docs.get(this.from());
      if (!this.on() || !after || !from) {
        this.viewReady.set(false);
        return;
      }
      this.viewGame.restoreFrom(displayState(from, after, items, decisions));
      this.viewReady.set(true);
    });
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onUpdate = (): void => {
      if (!this.on() || timer) {
        return;
      }
      timer = setTimeout(() => {
        timer = null;
        this.tick.update((count) => count + 1);
      }, RECOMPUTE_MS);
    };
    this.session.doc.on('update', onUpdate);
    inject(DestroyRef).onDestroy(() => {
      this.session.doc.off('update', onUpdate);
      if (timer) {
        clearTimeout(timer);
      }
      for (const game of this.loaded().values()) {
        game.destroy();
      }
      this.viewGame.destroy();
    });
  }

  /**
   * Turns diff mode on, on what the assistant made unless two sides were already chosen.
   * Turning it off drops every decision not applied.
   */
  setOn(on: boolean): void {
    if (on && this.from() === this.to()) {
      this.from.set('current');
      this.to.set(AI_REF);
    }
    if (!on) {
      this.taken.set(new Map());
      this.currentKey.set(null);
    }
    this.on.set(on);
  }

  choose(side: 'from' | 'to', ref: SnapshotRef): void {
    this[side].set(ref);
    this.taken.set(new Map());
    this.currentKey.set(null);
  }

  private async load(ref: SnapshotRef): Promise<void> {
    if (ref === 'current' || this.loaded().has(ref)) {
      return;
    }
    const row = this.history().find((held) => held.key === ref);
    if (ref !== AI_REF && !row) {
      return;
    }
    this.loading.set(true);
    this.loadFailed.set(false);
    try {
      const doc = row ? await loadVersionDoc(this.session.id, row) : await this.loadAiDraft();
      if (!doc) {
        this.aiEmpty.set(true);
        return;
      }
      // Looked at only: nothing in a saved version is ever written from here.
      const game = new EditableGame(doc, () => false);
      this.docs.set(ref, doc);
      this.loaded.update((held) => new Map(held).set(ref, game));
    } catch {
      this.loadFailed.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  /** The assistant's draft, or null where it has not written one. */
  private async loadAiDraft(): Promise<Y.Doc | null> {
    const workspace = unwrap(
      await aiProjectControllerWorkspaceOf({ path: { id: this.session.id } }),
    );
    this.aiRevision = workspace.revision;
    this.aiEmpty.set(false);
    if (!workspace.draft) {
      return null;
    }
    const doc = new Y.Doc();
    Y.applyUpdate(
      doc,
      Uint8Array.from(atob(workspace.draft), (char) => char.charCodeAt(0)),
    );
    migrateGame(doc);
    return doc;
  }

  decisionOf(key: string): Decision {
    return decisionOf(this.decisions(), key);
  }

  /** Decides `keys` and whatever they pull with them. Only a review decides anything. */
  decide(keys: readonly string[], decision: Decision): void {
    if (this.mode() !== 'review') {
      return;
    }
    this.taken.set(decide(this.items(), this.decisions(), keys, decision));
  }

  decideAll(decision: Exclude<Decision, 'pending'>): void {
    this.decide(
      this.pending().map((item) => item.key),
      decision,
    );
  }

  /** How a sound entry differs, while diff mode is on: what its list row and picker show. */
  soundKind(part: SoundPart, id: string): DiffKind | undefined {
    return this.on()
      ? this.items().find((item) => item.key === `sound:${part}:${id}`)?.kind
      : undefined;
  }

  itemsOf(editor: DiffEditor): ChangeItem[] {
    return this.items().filter((item) => item.editor === editor);
  }

  /** Selects a change and opens the tab it is reviewed in. */
  focus(item: ChangeItem): void {
    this.currentKey.set(item.key);
    void this.router.navigate(['/edit', this.session.id, item.editor]);
  }

  /** The next change (or the previous one), across every editor, wrapping round. */
  step(by: 1 | -1): void {
    const items = this.items();
    if (!items.length) {
      return;
    }
    const at = items.findIndex((item) => item.key === this.currentKey());
    const next = items[(at + by + items.length) % items.length] ?? items[0];
    if (next) {
      this.focus(next);
    }
  }

  /**
   * Writes what was accepted into the open document and leaves diff mode: the one write diff mode
   * makes, merged against the document as it stands now and put back through the game's gate like
   * a restore, so it reaches every peer and the autosave.
   */
  async apply(): Promise<boolean> {
    const after = this.after();
    if (this.mode() !== 'review' || !after) {
      return false;
    }
    const items = this.items();
    const kept = items.filter((item) => this.decisions().get(item.key) === 'ok');
    const state = mergeAccepted(
      this.session.doc,
      after,
      items,
      new Set(kept.map((item) => item.key)),
    );
    // What the assistant still offers: the same document with every change not yet decided.
    const waiting = items.filter((item) => !this.decisions().has(item.key));
    const draft =
      this.to() === AI_REF
        ? mergeAccepted(
            this.session.doc,
            after,
            items,
            new Set([...kept, ...waiting].map((item) => item.key)),
          )
        : null;
    this.editorMode.choose('normal');
    if (!this.editorMode.canWrite()) {
      return false;
    }
    this.session.game.restoreFrom(state);
    this.setOn(false);
    if (draft) {
      // Read again next time: the review moved the assistant's base and draft on.
      this.loaded.update((held) => {
        const next = new Map(held);
        next.get(AI_REF)?.destroy();
        this.docs.delete(AI_REF);
        next.delete(AI_REF);
        return next;
      });
      unwrap(
        await aiProjectControllerReview({
          path: { id: this.session.id },
          body: {
            revision: this.aiRevision,
            base: toBase64(state),
            draft: toBase64(draft),
            categories: categoriesOf(kept),
          },
        }),
      );
    }
    return true;
  }
}
