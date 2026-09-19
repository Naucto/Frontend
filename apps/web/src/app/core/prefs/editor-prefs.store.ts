import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';

import { readJson, STORAGE_KEYS, writeJson } from '../storage/local-storage';

interface EditorPrefs {
  autoRun: boolean;
  soundSnap: boolean;
}

const load = (): EditorPrefs => ({
  autoRun: true,
  soundSnap: true,
  ...readJson<Partial<EditorPrefs>>(STORAGE_KEYS.editorPrefs, {}),
});

/** Editor defaults chosen in Settings › Editor, kept per browser. */
export const EditorPrefsStore = signalStore(
  { providedIn: 'root' },
  withState<EditorPrefs>(load()),
  withMethods((store) => {
    const save = (): void => {
      writeJson(STORAGE_KEYS.editorPrefs, {
        autoRun: store.autoRun(),
        soundSnap: store.soundSnap(),
      });
    };
    return {
      setAutoRun(v: boolean): void {
        patchState(store, { autoRun: v });
        save();
      },
      setSoundSnap(v: boolean): void {
        patchState(store, { soundSnap: v });
        save();
      },
    };
  }),
);
