import type { ReportRole } from '@naucto/api-client';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';

/** A play shorter than this says too little about the platform to ask about it. */
export const PROMPT_AFTER_PLAY_MS = 2 * 60 * 1000;
/** Nor does a visit to the editor shorter than this. */
export const PROMPT_AFTER_BUILD_MS = 5 * 60 * 1000;

export interface ArmedPrompt {
  /** What the person was just doing, offered as their answer to "mostly play or create". */
  role: ReportRole;
  /** The release just played, for a prompt that follows a play. */
  releaseId: number | null;
}

interface FeedbackState {
  armed: ArmedPrompt | null;
}

/**
 * Whether something just happened that is worth asking about: a real play or a real editing
 * session. Whether the account may be asked at all is the server's to say.
 */
export const FeedbackStore = signalStore(
  { providedIn: 'root' },
  withState<FeedbackState>({ armed: null }),
  withMethods((store) => ({
    notePlayEnded(releaseId: number, activeMs: number): void {
      if (activeMs >= PROMPT_AFTER_PLAY_MS) {
        patchState(store, { armed: { role: 'PLAYER', releaseId } });
      }
    },
    noteEditorLeft(buildMs: number): void {
      if (buildMs >= PROMPT_AFTER_BUILD_MS) {
        patchState(store, { armed: { role: 'CREATOR', releaseId: null } });
      }
    },
    disarm(): void {
      patchState(store, { armed: null });
    },
  })),
);
