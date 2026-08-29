/** Typed, try/catch-wrapped localStorage access. Never store tokens here. */
export const STORAGE_KEYS = {
  theme: 'naucto.theme',
  reduceMotion: 'naucto.reduce-motion',
  playedProjects: 'naucto.played',
  inputBindings: 'naucto.input',
  editorCollapsed: 'naucto.editor.collapsed',
  editorConsoleWidth: 'naucto.editor.console-width',
  editorDocCollapsed: 'naucto.editor.doc-collapsed',
  editorPrefs: 'naucto.editor',
  oauthState: 'naucto.oauth.state',
  pkceVerifier: 'naucto.oauth.verifier',
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

export function readJson<T>(key: StorageKey, fallback: T, storage: Storage = localStorage): T {
  try {
    const raw = storage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writeJson(key: StorageKey, value: unknown, storage: Storage = localStorage): void {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota or private mode */
  }
}

export function remove(key: StorageKey, storage: Storage = localStorage): void {
  try {
    storage.removeItem(key);
  } catch {
    /* ignore */
  }
}
