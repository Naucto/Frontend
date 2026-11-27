import { computed, DestroyRef, effect, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  type ChangeItem,
  computeChanges,
  decide,
  type Decision,
  decisionOf,
  DIFF_EDITORS,
  type DiffEditor,
  EditableGame,
  type FileDiff,
  fileDiffs,
  keepLive,
  mergeAccepted,
} from '@naucto/engine';

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
  readonly loading = signal(false);
  readonly loadFailed = signal(false);
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
    const counts: Record<DiffEditor, number> = { code: 0, art: 0, map: 0, sound: 0, net: 0 };
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
    });
  }

  /**
   * Turns diff mode on, against the newest saved version unless two sides were already chosen.
   * Turning it off drops every decision not applied.
   */
  setOn(on: boolean): void {
    if (on && this.from() === this.to()) {
      const newest = this.history()[0];
      if (newest) {
        this.from.set(newest.key);
        this.to.set('current');
      }
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
    if (!row) {
      return;
    }
    this.loading.set(true);
    this.loadFailed.set(false);
    try {
      const doc = await loadVersionDoc(this.session.id, row);
      // Looked at only: nothing in a saved version is ever written from here.
      const game = new EditableGame(doc, () => false);
      this.loaded.update((held) => new Map(held).set(ref, game));
    } catch {
      this.loadFailed.set(true);
    } finally {
      this.loading.set(false);
    }
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
  apply(): boolean {
    const after = this.after();
    if (this.mode() !== 'review' || !after) {
      return false;
    }
    const accepted = new Set(
      [...this.decisions()].filter(([, decision]) => decision === 'ok').map(([key]) => key),
    );
    const state = mergeAccepted(this.session.doc, after, this.items(), accepted);
    this.editorMode.choose('normal');
    if (!this.editorMode.canWrite()) {
      return false;
    }
    this.session.game.restoreFrom(state);
    this.setOn(false);
    return true;
  }
}
