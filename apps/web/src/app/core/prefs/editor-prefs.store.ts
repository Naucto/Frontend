import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';

import { readJson, STORAGE_KEYS, writeJson } from '../storage/local-storage';

interface EditorPrefs {
  autoRun: boolean;
  soundSnap: boolean;
  /** Whether a panel section is open, by the key it is asked under; unrecorded means open. */
  sections: Record<string, boolean>;
}

const load = (): EditorPrefs => ({
  autoRun: true,
  soundSnap: true,
  sections: {},
  ...readJson<Partial<EditorPrefs>>(STORAGE_KEYS.editorPrefs, {}),
});

/** Editor defaults chosen in Settings › Editor, and which sections are folded; kept per browser. */
export const EditorPrefsStore = signalStore(
  { providedIn: 'root' },
  withState<EditorPrefs>(load),
  withMethods((store) => {
    const save = (): void => {
      writeJson(STORAGE_KEYS.editorPrefs, {
        autoRun: store.autoRun(),
        soundSnap: store.soundSnap(),
        sections: store.sections(),
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
      isOpen(key: string): boolean {
        return store.sections()[key] ?? true;
      },
      setSectionOpen(key: string, open: boolean): void {
        patchState(store, { sections: { ...store.sections(), [key]: open } });
        save();
      },
    };
  }),
);
