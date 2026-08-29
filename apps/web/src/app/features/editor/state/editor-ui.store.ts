import { computed } from '@angular/core';
import { readJson, STORAGE_KEYS, writeJson } from '@app/core/storage/local-storage';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';

export type EditorTab = 'game' | 'code' | 'art' | 'map' | 'sound' | 'net';
export type ConsoleTab = 'console' | 'doc' | 'perf';

interface EditorUiState {
  activeTab: EditorTab;
  /**
   * Per-tab override of the console column's collapsed state, remembered per user.
   *
   * Only what the reader has actually changed is stored, so the default below keeps working for
   * every tab they have not touched.
   */
  collapsedByTab: Partial<Record<EditorTab, boolean>>;
  consoleTab: ConsoleTab;
  docCollapsed: boolean;
  autoRun: boolean;
  viewportWidth: number;
  consoleWidth: number;
  pip: boolean;
}

export const DOC_SPLIT_BREAKPOINT = 1600;

/** Layout state of the editor shell (per editor route). */
export const EditorUiStore = signalStore(
  withState<EditorUiState>({
    activeTab: 'game',
    collapsedByTab: readJson<Partial<Record<EditorTab, boolean>>>(STORAGE_KEYS.editorCollapsed, {}),
    consoleTab: 'console',
    docCollapsed: false,
    autoRun: true,
    viewportWidth: 1280,
    consoleWidth: 420,
    pip: false,
  }),
  withComputed((s) => ({
    /**
     * CODE keeps the console beside it — that is where the machine talks back while you type. The
     * other tabs are canvases and the design gives them the full width, with the runtime available
     * as the floating viewer instead. Either way the reader's own choice wins.
     */
    collapsed: computed(() => s.collapsedByTab()[s.activeTab()] ?? s.activeTab() !== 'code'),
    /** Below the breakpoint the DOC tab replaces screen + console; above it the column splits. */
    columnMode: computed<'screen' | 'doc' | 'split'>(() =>
      s.consoleTab() !== 'doc'
        ? 'screen'
        : s.viewportWidth() < DOC_SPLIT_BREAKPOINT
          ? 'doc'
          : 'split',
    ),
  })),
  withMethods((store) => ({
    setTab(tab: EditorTab): void {
      patchState(store, { activeTab: tab });
    },
    setConsoleTab(tab: ConsoleTab): void {
      patchState(store, { consoleTab: tab });
    },
    toggleDoc(): void {
      patchState(store, { docCollapsed: !store.docCollapsed() });
    },
    setAutoRun(on: boolean): void {
      patchState(store, { autoRun: on });
    },
    setViewportWidth(w: number): void {
      patchState(store, { viewportWidth: w });
    },
    setConsoleWidth(w: number): void {
      patchState(store, { consoleWidth: Math.max(320, Math.min(720, w)) });
    },
    setPip(on: boolean): void {
      patchState(store, { pip: on });
    },
    togglePip(): void {
      patchState(store, { pip: !store.pip() });
    },
    toggleCollapsed(): void {
      const next = { ...store.collapsedByTab(), [store.activeTab()]: !store.collapsed() };
      patchState(store, { collapsedByTab: next });
      writeJson(STORAGE_KEYS.editorCollapsed, next);
    },
  })),
);
