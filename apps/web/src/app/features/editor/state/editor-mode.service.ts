import { computed, Injectable, signal } from '@angular/core';

/**
 * How the editor stands on the game it holds. `normal` writes. `diff` sets the game against
 * another of its versions and `read-only` shows it as it is; neither writes.
 */
export type EditorMode = 'normal' | 'diff' | 'read-only';

/** A mode in which nothing is written, which is the only kind the code imposes. */
export type ClosedMode = Exclude<EditorMode, 'normal'>;

/**
 * The mode of one editing session, and the one answer to "may this editor write". Provided by
 * the editor shell, so every tab of a session reads the same mode.
 *
 * A mode comes from two places. The code imposes one where the person may not write whatever
 * they want: a game opened to look at. The person chooses one otherwise. The imposed one wins,
 * and nothing takes it back for as long as the session lives.
 */
@Injectable()
export class EditorModeService {
  private readonly imposed = signal<ClosedMode | null>(null);
  private readonly chosen = signal<EditorMode>('normal');

  readonly mode = computed<EditorMode>(() => this.imposed() ?? this.chosen());
  readonly canWrite = computed(() => this.mode() === 'normal');

  /** Holds the session to a mode that does not write. The first one imposed stands. */
  impose(mode: ClosedMode): void {
    if (this.imposed() === null) {
      this.imposed.set(mode);
    }
  }

  /** The person's own choice, which shows only where the code imposes nothing. */
  choose(mode: EditorMode): void {
    this.chosen.set(mode);
  }
}
